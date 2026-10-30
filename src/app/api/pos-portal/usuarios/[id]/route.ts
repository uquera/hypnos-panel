import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"

// PATCH /api/pos-portal/usuarios/:id {activo} — el DUENO activa o desactiva a un EDITOR de su cuenta.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const dueno = await portalPos(true)
  if (!dueno) return jsonError("Solo el dueño de la cuenta puede hacer esto.", 403)
  const { id } = await params

  return manejar(async () => {
    const body = await req.json().catch(() => ({}))
    if (typeof body.activo !== "boolean") return jsonError("Nada que cambiar.")
    const r = await prisma.posUsuario.updateMany({
      where: { id, cuentaId: dueno.cuentaId, rol: "EDITOR" },
      data:  { activo: body.activo },
    })
    if (r.count !== 1) return jsonError("Usuario no encontrado.", 404)
    return NextResponse.json({ ok: true })
  })
}
