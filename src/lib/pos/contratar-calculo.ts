// Cálculo del pedido de la contratación online de Hypnos POS (/pos/contratar).
// Módulo puro (sin base de datos): lo usa la página para mostrar el total en vivo y el servidor,
// que es quien manda, para crear el pedido. Todos los montos en CLP con IVA incluido.

export type Plan = "MENSUAL" | "ANUAL"
export type TipoNegocio = "RESTAURANTE" | "ALMACEN"
export type Adicional = "marcha" | "point" | "tengo" | "fudo"

export interface Catalogo {
  mensualCaja: number     // plan mensual por caja
  anualCaja:   number     // plan anual por caja (por defecto 10 mensualidades)
  marcha:      number     // puesta en marcha asistida (gratis con el plan anual)
  point:       number     // Point Smart 2 (por unidad)
  cuotas:      number     // cuotas máximas en Mercado Pago (1 = sin cuotas)
  cuotasSinInteres: boolean // solo texto: las cuotas sin interés se activan en la cuenta de Mercado Pago
  pointActiva: boolean    // vender máquinas (apagar si no hay stock)
  maxCajas:    number
  diasPrueba:  number     // días de prueba gratis de las cuentas creadas desde la contratación
}

export interface Cupon { codigo: string; tipo: "PORCENTAJE" | "MONTO"; valor: number; soloAnual: boolean }

export interface Seleccion {
  plan: Plan
  cajas: number
  adicionales: Adicional[]
  maquinas?: number       // cantidad de Point (si eligió "point")
  cupon?: Cupon | null
}

export interface Linea { clave: "plan" | Adicional; nombre: string; cantidad: number; monto: number; nota?: string }

export interface Pedido {
  lineas:    Linea[]
  plan:      number       // monto del plan (antes del cupón)
  subtotal:  number
  descuento: number
  total:     number       // a pagar hoy (0 = prueba gratis)
  prueba:    boolean      // mensual sin nada pagado hoy: arranca la prueba gratis
  mensualDespues: number  // lo que pagará cada mes después de la prueba (plan mensual)
  maquinas:  number
  cuponAplicado: boolean
  cuponMotivo?: string    // por qué el cupón no aplica
}

export const CATALOGO_DEFECTO = (mensual = 20_000, diasPrueba = 7): Catalogo => ({
  mensualCaja: mensual,
  anualCaja: mensual * 10,
  marcha: 100_000,
  point: 44_990,
  cuotas: 3,
  cuotasSinInteres: true,
  pointActiva: true,
  maxCajas: 10,
  diasPrueba,
})

const entero = (n: unknown, min: number, max: number, def: number) => {
  const v = Math.round(Number(n))
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : def
}

export function calcularPedido(cat: Catalogo, s: Seleccion): Pedido {
  const anual = s.plan === "ANUAL"
  const cajas = entero(s.cajas, 1, cat.maxCajas, 1)
  const adds = new Set(s.adicionales)
  if (!cat.pointActiva) adds.delete("point")
  if (adds.has("point")) adds.delete("tengo")
  const maquinas = adds.has("point") ? entero(s.maquinas ?? 1, 1, cajas, 1) : 0

  const lineas: Linea[] = []
  const plan = (anual ? cat.anualCaja : cat.mensualCaja) * cajas
  lineas.push({
    clave: "plan",
    nombre: `Plan ${anual ? "anual" : "mensual"} · ${cajas} caja${cajas > 1 ? "s" : ""}`,
    cantidad: cajas, monto: plan,
    nota: anual ? "12 meses" : "primer mes",
  })
  if (adds.has("marcha")) lineas.push({ clave: "marcha", nombre: "Puesta en marcha asistida", cantidad: 1, monto: anual ? 0 : cat.marcha, nota: anual ? "incluida en el plan anual" : undefined })
  if (maquinas) lineas.push({ clave: "point", nombre: `Point Smart 2${maquinas > 1 ? ` × ${maquinas}` : ""}`, cantidad: maquinas, monto: cat.point * maquinas })
  if (adds.has("tengo")) lineas.push({ clave: "tengo", nombre: "Conectar mi máquina", cantidad: 1, monto: 0 })
  if (adds.has("fudo")) lineas.push({ clave: "fudo", nombre: "Migración desde mi sistema anterior", cantidad: 1, monto: 0 })

  // Mensual sin nada que pagar hoy (sin puesta en marcha ni máquina): prueba gratis, no se cobra el plan aún
  const prueba = !anual && lineas.every(l => l.clave === "plan" || l.monto === 0)
  const subtotal = prueba ? 0 : lineas.reduce((a, l) => a + l.monto, 0)

  let descuento = 0, cuponAplicado = false, cuponMotivo: string | undefined
  if (s.cupon) {
    if (prueba) cuponMotivo = "El cupón se usa al pagar. Con la prueba gratis no pagas nada hoy."
    else if (s.cupon.soloAnual && !anual) cuponMotivo = "Este cupón es solo para el plan anual."
    else {
      const d = s.cupon.tipo === "PORCENTAJE" ? Math.round(plan * Math.min(s.cupon.valor, 100) / 100) : s.cupon.valor
      descuento = Math.min(Math.max(d, 0), plan) // nunca descuenta la máquina ni la puesta en marcha
      cuponAplicado = descuento > 0
    }
  }

  return {
    lineas, plan, subtotal, descuento,
    total: Math.max(subtotal - descuento, 0),
    prueba,
    mensualDespues: cat.mensualCaja * cajas,
    maquinas,
    cuponAplicado, cuponMotivo,
  }
}

// ─── RUT chileno ──────────────────────────────────────────────────────────────

/** Normaliza "76.123.456-7" → "76123456-7"; null si el dígito verificador no calza. */
export function normalizarRut(v: string): string | null {
  const limpio = v.replace(/[^0-9kK]/g, "").toUpperCase()
  if (limpio.length < 8 || limpio.length > 9) return null
  const cuerpo = limpio.slice(0, -1), dv = limpio.slice(-1)
  let suma = 0, mult = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult
    mult = mult === 7 ? 2 : mult + 1
  }
  const r = 11 - (suma % 11)
  const esperado = r === 11 ? "0" : r === 10 ? "K" : String(r)
  return esperado === dv ? `${cuerpo}-${dv}` : null
}

/** "76123456-7" → "76.123.456-7" */
export function formatoRut(rut: string): string {
  const [c, dv] = rut.split("-")
  if (!c || !dv) return rut
  return `${c.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`
}

export const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL")
