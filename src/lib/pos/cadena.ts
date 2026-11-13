import { prisma } from "@/lib/prisma"
import { claveDiaChile, TZ_CHILE } from "@/lib/pos/fechas"

// "Mi cadena": dueños con varios locales de Hypnos POS. Cada local sigue siendo un sistema
// aparte (su base, caja, carta, TUU, apps); el portal lee el resumen de cada uno en
// /api/gobernanza/resumen con su master key y los suma. Si un local no responde, se muestra
// como caído y el resto sigue. Solo lectura.

export type Rango = "hoy" | "ayer" | "semana" | "mes" | "mes-anterior" | "personalizado"
export const RANGOS: { id: Rango; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "semana", label: "Últimos 7 días" },
  { id: "mes", label: "Este mes" },
  { id: "mes-anterior", label: "Mes anterior" },
  { id: "personalizado", label: "Fechas" },
]

export type ResumenLocal = {
  local: string
  ventas: number
  pedidos: number
  ticketPromedio: number
  propinas: number
  porMedio: Record<string, number>
  porCanal: Record<string, { monto: number; pedidos: number }>
  porDia: Record<string, number>
  topProductos: { nombre: string; cantidad: number; monto: number }[]
  gastos: number
  gastosCantidad: number
  cajasAbiertas: { caja: string; desde: string; usuario: string; apertura: number }[]
  anterior: { ventas: number; pedidos: number }
}

export type LocalCadena = {
  cuentaId: string
  nombre: string
  codigo: string
  posUrl: string
  ok: boolean
  error?: string
  resumen?: ResumenLocal
}

/** Correos de la cadena normalizados. */
export const correosDe = (s: string) => s.split(/[\s,;]+/).map((c) => c.trim().toLowerCase()).filter((c) => c.includes("@"))

/** La cadena de la que este correo es dueño (o null). */
export async function cadenaDe(email: string) {
  const e = email.trim().toLowerCase()
  const cadenas = await prisma.posCadena.findMany({
    include: {
      cuentas: {
        where: { eliminadaAt: null },
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true, codigo: true, posUrl: true, estadoAlta: true, activo: true, cliente: { select: { masterKey: true } } },
      },
    },
  })
  return cadenas.find((c) => correosDe(c.correos).includes(e)) ?? null
}

// ── Fechas (hora de Chile) ──

/** Medianoche de Chile del día "YYYY-MM-DD", como instante UTC. */
export function inicioDiaChile(clave: string): Date {
  const [y, m, d] = clave.split("-").map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0)
  // diferencia entre la hora de Chile y UTC en ese instante (−3 o −4 según horario de verano)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ_CHILE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"))
  return new Date(guess - (local - guess))
}

const sumarDias = (clave: string, n: number) => {
  const [y, m, d] = clave.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Rango [desde, hasta) en hora de Chile. Para "personalizado", desde/hasta son días inclusivos. */
export function rangoFechas(rango: Rango, desdeDia?: string, hastaDia?: string, hoy = new Date()) {
  const h = claveDiaChile(hoy)
  let a = h
  let b = sumarDias(h, 1)
  if (rango === "ayer") { a = sumarDias(h, -1); b = h }
  else if (rango === "semana") { a = sumarDias(h, -6) }
  else if (rango === "mes") { a = `${h.slice(0, 7)}-01` }
  else if (rango === "mes-anterior") {
    const [y, m] = h.split("-").map(Number)
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
    a = prev
    b = `${h.slice(0, 7)}-01`
  } else if (rango === "personalizado") {
    const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
    if (ok(desdeDia) && ok(hastaDia) && desdeDia! <= hastaDia!) { a = desdeDia!; b = sumarDias(hastaDia!, 1) }
  }
  // Un período que incluye hoy termina "ahora": no cambia las ventas (no hay futuras), pero así el
  // período anterior del mismo largo se compara a la misma hora (hoy vs ayer hasta esta hora).
  const fin = inicioDiaChile(b)
  return { desde: inicioDiaChile(a), hasta: fin > hoy ? hoy : fin, desdeDia: a, hastaDia: sumarDias(b, -1) }
}

// ── Lectura de los locales ──

type CuentaCadena = NonNullable<Awaited<ReturnType<typeof cadenaDe>>>["cuentas"][number]

export async function leerLocal(c: CuentaCadena, desde: Date, hasta: Date): Promise<LocalCadena> {
  const base = { cuentaId: c.id, nombre: c.nombre, codigo: c.codigo, posUrl: c.posUrl }
  const key = c.cliente?.masterKey
  if (!key || !/^https:\/\//.test(c.posUrl)) return { ...base, ok: false, error: "Local sin conexión con el panel" }
  if (!c.activo) return { ...base, ok: false, error: "Local suspendido" }
  try {
    const url = `${c.posUrl.replace(/\/+$/, "")}/api/gobernanza/resumen?from=${encodeURIComponent(desde.toISOString())}&to=${encodeURIComponent(hasta.toISOString())}`
    const res = await fetch(url, { headers: { "X-Master-Key": key }, cache: "no-store", signal: AbortSignal.timeout(12_000) })
    if (!res.ok) return { ...base, ok: false, error: res.status === 404 ? "El local aún no tiene la versión con resumen" : `El local respondió ${res.status}` }
    return { ...base, ok: true, resumen: (await res.json()) as ResumenLocal }
  } catch (e) {
    return { ...base, ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "El local no respondió a tiempo" : "No se pudo conectar con el local" }
  }
}

export type Consolidado = {
  ventas: number
  pedidos: number
  ticketPromedio: number
  propinas: number
  gastos: number
  porMedio: Record<string, number>
  porCanal: Record<string, { monto: number; pedidos: number }>
  porDia: Record<string, number>
  topProductos: { nombre: string; cantidad: number; monto: number }[]
  anterior: { ventas: number; pedidos: number }
}

export function consolidar(locales: LocalCadena[]): Consolidado {
  const t: Consolidado = { ventas: 0, pedidos: 0, ticketPromedio: 0, propinas: 0, gastos: 0, porMedio: {}, porCanal: {}, porDia: {}, topProductos: [], anterior: { ventas: 0, pedidos: 0 } }
  const prods: Record<string, { nombre: string; cantidad: number; monto: number }> = {}
  for (const l of locales) {
    const r = l.resumen
    if (!r) continue
    t.ventas += r.ventas
    t.pedidos += r.pedidos
    t.propinas += r.propinas
    t.gastos += r.gastos
    t.anterior.ventas += r.anterior.ventas
    t.anterior.pedidos += r.anterior.pedidos
    for (const [k, v] of Object.entries(r.porMedio)) t.porMedio[k] = (t.porMedio[k] ?? 0) + v
    for (const [k, v] of Object.entries(r.porCanal)) {
      t.porCanal[k] ??= { monto: 0, pedidos: 0 }
      t.porCanal[k].monto += v.monto
      t.porCanal[k].pedidos += v.pedidos
    }
    for (const [k, v] of Object.entries(r.porDia)) t.porDia[k] = (t.porDia[k] ?? 0) + v
    // productos por nombre (cada local tiene su propia carta)
    for (const p of r.topProductos) {
      const k = p.nombre.trim().toLowerCase()
      prods[k] ??= { nombre: p.nombre, cantidad: 0, monto: 0 }
      prods[k].cantidad += p.cantidad
      prods[k].monto += p.monto
    }
  }
  t.ticketPromedio = t.pedidos ? Math.round(t.ventas / t.pedidos) : 0
  t.topProductos = Object.values(prods).sort((a, b) => b.monto - a.monto).slice(0, 15)
  return t
}

/** Lee todos los locales de la cadena en paralelo y los suma. */
export async function resumenCadena(cadena: NonNullable<Awaited<ReturnType<typeof cadenaDe>>>, desde: Date, hasta: Date) {
  const locales = await Promise.all(cadena.cuentas.map((c) => leerLocal(c, desde, hasta)))
  return { locales, total: consolidar(locales) }
}

export const MEDIO_LABEL: Record<string, string> = {
  CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", QR: "QR", OTHER: "Otro", ACCOUNT: "Cuenta corriente",
  UBER_EATS: "Uber Eats", RAPPI: "Rappi", PEDIDOSYA: "PedidosYa", AMIPASS: "amiPASS",
}

/** Variación porcentual (null si no hay base para comparar). */
export const variacion = (actual: number, anterior: number) => (anterior > 0 ? Math.round(((actual - anterior) / anterior) * 100) : null)
