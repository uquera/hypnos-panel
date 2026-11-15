import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"
import { excedeLimite } from "@/lib/pos/servidor"
import { cancelarSuscripcion, crearSuscripcion } from "@/lib/pos/mp-suscripcion"

// /api/pos-portal/suscripcion — pago automático mensual con Mercado Pago (solo DUENO).
// POST { email } → { url } link de Mercado Pago para autorizar la tarjeta.
// DELETE → cancela el pago automático vigente.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const yo = await portalPos(true)
  if (!yo) return jsonError("Tu sesión venció. Vuelve a ingresar.", 401)
  if (excedeLimite(`pos-sus:${yo.cuentaId}`, 10, 60 * 60_000)) return jsonError("Demasiados intentos. Intenta más tarde.", 429)
  return manejar(async () => {
    const b = (await req.json().catch(() => ({}))) as { email?: unknown }
    const sus = await crearSuscripcion({ cuentaId: yo.cuentaId, email: typeof b.email === "string" ? b.email : yo.email, creadoPor: yo.email })
    return NextResponse.json({ ok: true, url: sus.initPoint })
  })
}

export async function DELETE(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const yo = await portalPos(true)
  if (!yo) return jsonError("Tu sesión venció. Vuelve a ingresar.", 401)
  return manejar(async () => {
    await cancelarSuscripcion(yo.cuentaId, yo.email)
    return NextResponse.json({ ok: true })
  })
}
