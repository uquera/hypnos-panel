import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { calcularEstado } from "@/lib/licencia-utils"
import { urlSitio } from "@/lib/url-sitio"
import { toUSD } from "@/lib/monedas"
import { PlusCircle, TrendingUp, Wallet, AlertTriangle, XCircle } from "lucide-react"
import HealthMonitor from "./_components/HealthMonitor"
import RankingClientes, { type RankingCliente, type TramoIngresos } from "./_components/RankingClientes"
import RankingMeses, { type MesIngresos } from "./_components/RankingMeses"
import ListaClientes, { type FilaCliente } from "./_components/ListaClientes"

export const metadata = { title: "Clientes — Hypnos Panel" }
export const dynamic = "force-dynamic"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60)  return "ahora"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)  return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1)    return "hace 1 día"
  if (days < 7)      return `hace ${days} días`
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" })
}

const ACCION_LABEL: Record<string, string> = {
  LICENCIA_SYNC:     "sincronizó licencia de",
  PAGO_REGISTRADO:   "registró pago de",
  RENOVACION:        "renovó licencia de",
  CLIENTE_CREADO:    "creó el cliente",
  CLIENTE_ARCHIVADO: "archivó el cliente",
}

function formatUSD(monto: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(monto)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  await auth()

  const now             = new Date()
  const primerDiaMes    = new Date(now.getFullYear(), now.getMonth(), 1)
  const primerDiaSigMes = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Incluye archivados: el ranking histórico debe reconocer lo que aportó un
  // cliente aunque hoy ya no esté activo. La tabla de abajo sigue siendo solo
  // de activos.
  const [clientesTodos, pagosTotal, actividadReciente] = await Promise.all([
    prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
    // Todos los pagos históricos (se convierten a USD y se segmentan en JS)
    prisma.pago.findMany({
      select: { clienteId: true, monto: true, moneda: true, concepto: true, fechaPago: true },
    }),
    // Últimas 10 acciones
    prisma.actividadLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ])

  const clientes = clientesTodos.filter(c => c.activo)

  // Filas de la lista. El estado y los días se calculan en el servidor: dependen de
  // la hora actual y calcularlos también en el navegador daría distinto HTML.
  const filasClientes: FilaCliente[] = clientes.map(c => {
    const e = calcularEstado(c)
    return {
      id: c.id, nombre: c.nombre, dominio: c.dominio, plan: c.plan,
      url: urlSitio(c.dominio),
      vence: c.fechaVencimiento.toISOString(),
      venceTxt: new Date(c.fechaVencimiento).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
      grupo: c.suspendida ? "SUSPENDIDA" : e.diasRestantes <= 0 ? "VENCIDA" : e.diasRestantes <= 7 ? "POR_VENCER" : "ACTIVA",
      etiqueta: e.label, color: e.color, textColor: e.textColor, dias: e.diasRestantes,
    }
  })

  const esDelMes = (f: Date) => f >= primerDiaMes && f < primerDiaSigMes

  const mrr            = pagosTotal.reduce((s, p) => s + (esDelMes(p.fechaPago) ? toUSD(p.monto, p.moneda) : 0), 0)
  const totalHistorico = pagosTotal.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)

  // ─── Ranking de clientes por ingresos generados ─────────────────────────────
  // Tres tramos (mes, últimos 12 meses, histórico), cada uno desglosado por
  // vertical, para que el cliente pueda alternar el período sin recargar.
  const inicio12Meses = new Date(now.getFullYear(), now.getMonth() - 11, 1)

  const tramoVacio = (): TramoIngresos => ({ licencia: 0, marketing: 0, desarrollo: 0, total: 0 })

  const acum = new Map<string, RankingCliente & { primerPago: Date | null; ultimoPago: Date | null }>()
  for (const c of clientesTodos) {
    acum.set(c.id, {
      id: c.id, nombre: c.nombre, plan: c.plan, activo: c.activo,
      pagos: 0, mesesActivo: 1, primerPago: null, ultimoPago: null,
      mes: tramoVacio(), anio: tramoVacio(), hist: tramoVacio(),
    })
  }

  for (const p of pagosTotal) {
    const r = acum.get(p.clienteId)
    if (!r) continue
    const usd   = toUSD(p.monto, p.moneda)
    const clave = p.concepto === "MARKETING" ? "marketing"
                : p.concepto === "DESARROLLO" ? "desarrollo"
                : "licencia"

    const sumar = (t: TramoIngresos) => { t[clave] += usd; t.total += usd }
    sumar(r.hist)
    if (p.fechaPago >= inicio12Meses) sumar(r.anio)
    if (esDelMes(p.fechaPago))        sumar(r.mes)

    r.pagos += 1
    if (!r.primerPago || p.fechaPago < r.primerPago) r.primerPago = p.fechaPago
    if (!r.ultimoPago || p.fechaPago > r.ultimoPago) r.ultimoPago = p.fechaPago
  }

  const mesesEntre = (a: Date, b: Date) =>
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1

  const ranking: RankingCliente[] = [...acum.values()].map(({ primerPago, ultimoPago, ...r }) => ({
    ...r,
    // Meses de vida del cliente, para el promedio mensual. En los archivados se
    // corta en su último pago: si no, el promedio se diluye mes a mes.
    mesesActivo: primerPago
      ? Math.max(1, mesesEntre(primerPago, r.activo ? now : (ultimoPago ?? now)))
      : 1,
  }))

  // ─── Ranking de meses por ingresos ──────────────────────────────────────────
  // Serie continua desde el primer pago hasta el mes actual: los meses sin
  // ingresos también cuentan (en la vista cronológica se ven como huecos).
  const claveMes = (f: Date) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}`

  const porMes = new Map<string, MesIngresos & { clientesSet: Set<string> }>()

  if (pagosTotal.length > 0) {
    const primero = pagosTotal.reduce((min, p) => (p.fechaPago < min ? p.fechaPago : min), pagosTotal[0].fechaPago)
    const cursor  = new Date(primero.getFullYear(), primero.getMonth(), 1)
    while (cursor <= primerDiaMes) {
      porMes.set(claveMes(cursor), {
        key:   claveMes(cursor),
        label: cursor.toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
        corto: cursor.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
        licencia: 0, marketing: 0, desarrollo: 0, total: 0,
        clientes: 0, pagos: 0, clientesSet: new Set<string>(),
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  for (const p of pagosTotal) {
    const m = porMes.get(claveMes(p.fechaPago))
    if (!m) continue
    const usd   = toUSD(p.monto, p.moneda)
    const clave = p.concepto === "MARKETING" ? "marketing"
                : p.concepto === "DESARROLLO" ? "desarrollo"
                : "licencia"
    m[clave] += usd
    m.total  += usd
    m.pagos  += 1
    m.clientesSet.add(p.clienteId)
  }

  const meses: MesIngresos[] = [...porMes.values()].map(({ clientesSet, ...m }) => ({
    ...m,
    clientes: clientesSet.size,
  }))

  const porVencer = clientes.filter((c) => {
    const dias = Math.ceil((new Date(c.fechaVencimiento).getTime() - now.getTime()) / 86_400_000)
    return !c.suspendida && dias > 0 && dias <= 30
  }).length

  const problemas = clientes.filter(
    (c) => c.suspendida || new Date(c.fechaVencimiento) <= now
  ).length

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">Gestión de licencias SaaS</p>
        </div>
        <Link
          href="/admin/clientes/nuevo"
          className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 shadow-sm shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          <PlusCircle size={16} />
          <span className="hidden sm:inline">Nuevo cliente</span>
          <span className="sm:hidden">Nuevo</span>
        </Link>
      </div>

      {/* Stats — 4 tarjetas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={14} className="text-indigo-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingresos mes</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatUSD(mrr)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USD · {now.toLocaleDateString("es-CL", { month: "long" })}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-indigo-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total histórico</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatUSD(totalHistorico)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USD acumulado</p>
        </div>

        <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por vencer</p>
          </div>
          <p className="text-xl font-bold text-amber-600">{porVencer}</p>
          <p className="text-xs text-gray-400 mt-0.5">próximos 30 días</p>
        </div>

        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={14} className="text-red-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencidos</p>
          </div>
          <p className="text-xl font-bold text-red-600">{problemas}</p>
          <p className="text-xs text-gray-400 mt-0.5">suspendidos o expirados</p>
        </div>
      </div>

      {/* Health Monitor */}
      <HealthMonitor clientes={clientes.map(c => ({
        id:            c.id,
        nombre:        c.nombre,
        ultimoCheck:   c.ultimoCheck?.toISOString() ?? null,
        ultimoCheckOk: c.ultimoCheckOk,
      }))} />

      {/* Lista de clientes: filtro por estado y orden por columna (ListaClientes) */}
      <ListaClientes clientes={filasClientes} />

      {/* Ranking de clientes por ingresos generados */}
      {ranking.length > 0 && <RankingClientes clientes={ranking} />}

      {/* Ranking de meses por ingresos */}
      {meses.length > 0 && <RankingMeses meses={meses} />}

      {/* Log de actividad reciente */}
      {actividadReciente.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Actividad reciente</h2>
          <div className="space-y-3.5">
            {actividadReciente.map((log) => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {log.usuarioNombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700 leading-snug">
                    <span className="font-semibold">{log.usuarioNombre}</span>
                    {" "}
                    <span className="text-gray-500">{ACCION_LABEL[log.accion] ?? log.accion}</span>
                    {log.clienteNombre && (
                      <span className="font-medium text-gray-800"> {log.clienteNombre}</span>
                    )}
                  </p>
                  {log.detalle && (
                    <p className="text-xs text-gray-400 mt-0.5">{log.detalle}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
