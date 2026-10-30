import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { ROLES_POS, type RolPos } from "@/lib/pos/validacion"
import { logActividad } from "@/lib/actividad"

// PATCH /api/pos-admin/usuarios/:id — activar/desactivar o cambiar rol.
// DELETE /api/pos-admin/usuarios/:id — eliminar la sub-cuenta (y sus enlaces).

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params

  return manejar(async () => {
    const body = await req.json().catch(() => ({}))
    const data: { activo?: boolean; rol?: RolPos } = {}
    if (typeof body.activo === "boolean") data.activo = body.activo
    if (ROLES_POS.includes(body.rol)) data.rol = body.rol
    if (!Object.keys(data).length) return jsonError("Nada que cambiar.")

    const usuario = await prisma.posUsuario.update({ where: { id }, data }).catch(() => null)
    if (!usuario) return jsonError("Usuario no encontrado.", 404)
    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      accion: "POS_USUARIO_EDITADO", detalle: `${usuario.email}: ${JSON.stringify(data)}`,
    })
    return NextResponse.json({ ok: true })
  })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params

  return manejar(async () => {
    const usuario = await prisma.posUsuario.delete({ where: { id } }).catch(() => null)
    if (!usuario) return jsonError("Usuario no encontrado.", 404)
    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      accion: "POS_USUARIO_ELIMINADO", detalle: usuario.email,
    })
    return NextResponse.json({ ok: true })
  })
}
