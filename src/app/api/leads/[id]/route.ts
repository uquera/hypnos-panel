import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"
import { esEstado } from "@/lib/leads"

// PATCH — mover de estado o dejar notas de seguimiento
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })

  const body = await req.json()

  const estado = body.estado ?? lead.estado
  if (!esEstado(estado)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
  }

  const notas = body.notas !== undefined
    ? (String(body.notas).trim().slice(0, 2000) || null)
    : lead.notas

  const updated = await prisma.lead.update({ where: { id }, data: { estado, notas } })

  // Solo se audita el cambio de estado: las notas se editan constantemente
  // y llenarían el log de ruido sin aportar trazabilidad útil.
  if (estado !== lead.estado) {
    await logActividad({
      usuarioId:     session.user.id ?? "",
      usuarioNombre: session.user.name ?? session.user.email ?? "?",
      accion:        "LEAD_ESTADO",
      detalle:       `${lead.negocio} · ${lead.estado} → ${estado}`,
    })
  }

  return NextResponse.json({ lead: updated })
}

// DELETE — solo ADMIN
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden eliminar leads" }, { status: 403 })

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })

  await prisma.lead.delete({ where: { id } })

  await logActividad({
    usuarioId:     session.user.id ?? "",
    usuarioNombre: session.user.name ?? session.user.email ?? "?",
    accion:        "LEAD_ELIMINADO",
    detalle:       `${lead.negocio} · ${lead.nombre}`,
  })

  return NextResponse.json({ ok: true })
}
