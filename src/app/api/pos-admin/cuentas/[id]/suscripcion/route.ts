import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { cancelarSuscripcion, crearSuscripcion, sincronizarSuscripcion, suscripcionVigente } from "@/lib/pos/mp-suscripcion"

// /api/pos-admin/cuentas/[id]/suscripcion — pago automático con Mercado Pago desde la ficha (ADMIN).
// POST { email } → { url } link para mandarle al dueño · PUT → revisar ahora en Mercado Pago · DELETE → cancelar.
type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const s = await adminPos()
  if (!s) return jsonError("No autorizado", 403)
  const { id } = await params
  return manejar(async () => {
    const b = (await req.json().catch(() => ({}))) as { email?: unknown }
    const sus = await crearSuscripcion({ cuentaId: id, email: typeof b.email === "string" ? b.email : "", creadoPor: s.user.name ?? "Hypnos" })
    return NextResponse.json({ ok: true, url: sus.initPoint })
  })
}

export async function PUT(_req: Request, { params }: Ctx) {
  if (!(await adminPos())) return jsonError("No autorizado", 403)
  const { id } = await params
  return manejar(async () => {
    const sus = await suscripcionVigente(id)
    if (!sus) return jsonError("No hay pago automático.", 404)
    const r = await sincronizarSuscripcion(sus.mpId)
    return NextResponse.json({ ok: true, ...r })
  })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await adminPos()
  if (!s) return jsonError("No autorizado", 403)
  const { id } = await params
  return manejar(async () => {
    await cancelarSuscripcion(id, s.user.name ?? "Hypnos")
    return NextResponse.json({ ok: true })
  })
}
