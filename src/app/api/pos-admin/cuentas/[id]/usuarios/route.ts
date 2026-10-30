import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { invitarUsuario, leerInvitacion, usuarioPublico } from "@/lib/pos/usuarios"
import { basePublica } from "@/lib/pos/servidor"
import { logActividad } from "@/lib/actividad"

// POST /api/pos-admin/cuentas/:id/usuarios — Hypnos invita una sub-cuenta (DUENO o EDITOR).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params

  return manejar(async () => {
    const datos = leerInvitacion(await req.json().catch(() => ({})))
    const { usuario, enviado } = await invitarUsuario(id, datos, "Hypnos", basePublica(req))
    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      accion: "POS_USUARIO_INVITADO", detalle: `${usuario.email} (${usuario.rol})`,
    })
    return NextResponse.json({ ok: true, enviado, usuario: usuarioPublico(usuario) }, { status: 201 })
  })
}
