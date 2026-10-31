import { prisma } from "@/lib/prisma"

// Links de cobro TUU (Haulmer "Link de pago"), uno por monto mensual (20.000 / 40.000 / 45.000).
// Se editan en /admin/pos. El portal y los correos de cobro muestran "Pagar con tarjeta" con el
// link del precio de cada restaurante; el pago se confirma subiendo el comprobante, como la transferencia.

const CLAVE = "linksPago"
const URL_OK = /^https:\/\/[^\s"'<>]+$/

export async function getLinksPago(): Promise<Record<string, string>> {
  const row = await prisma.posConfig.findUnique({ where: { clave: CLAVE } }).catch(() => null)
  if (!row) return {}
  try {
    const v = JSON.parse(row.valor) as Record<string, unknown>
    return Object.fromEntries(Object.entries(v).filter(([m, u]) => /^\d+$/.test(m) && typeof u === "string" && URL_OK.test(u))) as Record<string, string>
  } catch {
    return {}
  }
}

/** Link del monto exacto, o null si no hay (entonces solo se ofrece transferencia). */
export async function linkPagoPara(monto: number): Promise<string | null> {
  return (await getLinksPago())[String(Math.round(monto))] ?? null
}

/** Guarda la lista { monto: url } (montos enteros > 0, URLs https). Devuelve el error o null. */
export async function guardarLinksPago(filas: { monto: unknown; url: unknown }[]): Promise<string | null> {
  const out: Record<string, string> = {}
  for (const f of filas) {
    const monto = Math.round(Number(String(f.monto ?? "").replace(/[^\d]/g, "")))
    const url = String(f.url ?? "").trim()
    if (!monto && !url) continue
    if (!(monto > 0)) return "Cada link necesita su monto."
    if (!URL_OK.test(url)) return `El link de ${monto.toLocaleString("es-CL")} debe empezar con https://`
    out[String(monto)] = url
  }
  await prisma.posConfig.upsert({ where: { clave: CLAVE }, create: { clave: CLAVE, valor: JSON.stringify(out) }, update: { valor: JSON.stringify(out) } })
  return null
}
