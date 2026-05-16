import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"

const MONEDAS_VALIDAS = ["USD", "CLP", "EUR"]

// PATCH — editar (solo ADMIN)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden editar retiros" }, { status: 403 })

  const { id } = await params
  const retiro = await prisma.retiro.findUnique({ where: { id } })
  if (!retiro) return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 })

  const body = await req.json()
  const monto   = parseFloat(body.monto)
  const moneda  = body.moneda  || retiro.moneda
  const fecha   = body.fecha   ? new Date(body.fecha) : retiro.fecha
  const concepto = body.concepto !== undefined ? (body.concepto?.trim() || null) : retiro.concepto

  if (isNaN(monto) || monto <= 0)
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  if (!MONEDAS_VALIDAS.includes(moneda))
    return NextResponse.json({ error: "Moneda inválida" }, { status: 400 })

  const updated = await prisma.retiro.update({
    where: { id },
    data: { monto, moneda, fecha, concepto },
    include: { registradoPor: { select: { id: true, nombre: true } } },
  })

  await logActividad({
    usuarioId: session.user.id ?? "", usuarioNombre: session.user.name ?? session.user.email ?? "?",
    accion: "RETIRO_EDITADO",
    detalle: `${updated.registradoPor.nombre} · ${updated.moneda} ${updated.monto}${updated.concepto ? ` · ${updated.concepto}` : ""}`,
  })

  return NextResponse.json({ retiro: updated })
}

// DELETE — solo ADMIN
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden eliminar retiros" }, { status: 403 })

  const { id } = await params
  const retiro = await prisma.retiro.findUnique({ where: { id } })
  if (!retiro) return NextResponse.json({ error: "Retiro no encontrado" }, { status: 404 })

  await prisma.retiro.delete({ where: { id } })

  await logActividad({
    usuarioId: session.user.id ?? "", usuarioNombre: session.user.name ?? session.user.email ?? "?",
    accion: "RETIRO_ELIMINADO",
    detalle: `${retiro.moneda} ${retiro.monto}${retiro.concepto ? ` · ${retiro.concepto}` : ""}`,
  })

  return NextResponse.json({ ok: true })
}
