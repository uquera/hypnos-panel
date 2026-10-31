import { prisma } from "@/lib/prisma"

// Links de cobro TUU (Haulmer "Link de pago"). Cada link es una opción de pago de un plan:
//   { precio: 20000, meses: 1,  monto: 20000,  url }  mensualidad del plan de $20.000
//   { precio: 20000, meses: 12, monto: 200000, url }  plan anual de ese mismo plan (2 meses de regalo)
// Se editan en /admin/pos. El portal y los correos de cobro muestran las opciones del precio de
// cada restaurante; el pago se confirma subiendo el comprobante, como la transferencia, y al
// aprobarlo se sugieren los meses de la opción que calza con el monto.

export type LinkPago = { precio: number; meses: number; monto: number; url: string }

const CLAVE = "linksPago"
const URL_OK = /^https:\/\/[^\s"'<>]+$/
const entero = (v: unknown) => Math.round(Number(String(v ?? "").replace(/[^\d]/g, "")))

export async function getLinksPago(): Promise<LinkPago[]> {
  const row = await prisma.posConfig.findUnique({ where: { clave: CLAVE } }).catch(() => null)
  if (!row) return []
  try {
    const v = JSON.parse(row.valor) as unknown
    if (!Array.isArray(v)) return []
    return v
      .map(x => x as Record<string, unknown>)
      .map(x => ({ precio: entero(x.precio), meses: entero(x.meses) || 1, monto: entero(x.monto), url: String(x.url ?? "") }))
      .filter(x => x.precio > 0 && x.monto > 0 && x.meses >= 1 && x.meses <= 12 && URL_OK.test(x.url))
  } catch {
    return []
  }
}

/** Opciones de pago de un plan (precio mensual), de menos a más meses. */
export async function opcionesPago(precio: number): Promise<LinkPago[]> {
  return (await getLinksPago()).filter(l => l.precio === Math.round(precio)).sort((a, b) => a.meses - b.meses)
}

/** Link de la mensualidad de ese precio (correos de cobro), o null si no hay: entonces solo transferencia. */
export async function linkPagoPara(precio: number): Promise<string | null> {
  return (await opcionesPago(precio)).find(l => l.meses === 1)?.url ?? null
}

/**
 * Meses que cubre un pago: los de la opción del plan con ese monto (anual = 12), o si no calza,
 * cuántas mensualidades alcanza a pagar (1 a 12).
 */
export async function mesesDePago(precio: number, monto: number): Promise<number> {
  const op = (await opcionesPago(precio)).find(l => l.monto === Math.round(monto))
  if (op) return op.meses
  return Math.min(12, Math.max(1, Math.floor(monto / Math.max(precio, 1))))
}

/** Guarda las opciones [{ precio, meses, monto, url }]. Devuelve el error o null. */
export async function guardarLinksPago(filas: Record<string, unknown>[]): Promise<string | null> {
  const out: LinkPago[] = []
  for (const f of filas) {
    const precio = entero(f.precio), meses = entero(f.meses) || 1, monto = entero(f.monto), url = String(f.url ?? "").trim()
    if (!url) continue // opción sin link: no se ofrece
    if (!(precio > 0) || !(monto > 0)) return "Cada link necesita el plan (precio mensual) y el monto a cobrar."
    if (meses < 1 || meses > 12) return "Los meses deben ir de 1 a 12."
    if (!URL_OK.test(url)) return `El link de $${monto.toLocaleString("es-CL")} debe empezar con https://`
    if (out.some(o => o.precio === precio && o.meses === meses)) return `Hay dos links para el plan de $${precio.toLocaleString("es-CL")} por ${meses} mes(es).`
    out.push({ precio, meses, monto, url })
  }
  await prisma.posConfig.upsert({ where: { clave: CLAVE }, create: { clave: CLAVE, valor: JSON.stringify(out) }, update: { valor: JSON.stringify(out) } })
  return null
}
