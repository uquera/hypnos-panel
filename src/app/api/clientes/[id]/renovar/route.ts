import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"

// PATCH /api/clientes/[id]/renovar
// Renueva la licencia +30 días desde el vencimiento actual (o desde hoy si ya venció).
// Sincroniza con el servidor del cliente de forma best-effort.
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({ where: { id } })
  if (!cliente || !cliente.activo) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  // Base de renovación: si aún vigente, extiende desde el vencimiento; si ya venció, desde hoy
  const base = new Date(cliente.fechaVencimiento) > new Date()
    ? new Date(cliente.fechaVencimiento)
    : new Date()
  const nuevaFecha = new Date(base)
  nuevaFecha.setDate(nuevaFecha.getDate() + 30)
  const nuevaFechaStr = nuevaFecha.toISOString().split("T")[0]

  // Actualizar en DB local
  await prisma.cliente.update({
    where: { id },
    data: { fechaVencimiento: nuevaFecha, suspendida: false },
  })

  // Sincronizar con el servidor del cliente (best-effort)
  let syncedRemote = false
  try {
    const controller = new AbortController()
    const timeoutId  = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(cliente.apiUrl, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "X-Master-Key": cliente.masterKey },
      body:    JSON.stringify({ fechaVencimiento: nuevaFechaStr, suspendida: false }),
      signal:  controller.signal,
    })
    clearTimeout(timeoutId)
    syncedRemote = res.ok
  } catch { /* cliente caído — operación local ya guardada */ }

  // Log de actividad
  if (session.user.id) {
    await logActividad({
      usuarioId:     session.user.id,
      usuarioNombre: session.user.name ?? "Usuario",
      clienteId:     cliente.id,
      clienteNombre: cliente.nombre,
      accion:        "RENOVACION",
      detalle:       `Nueva fecha: ${nuevaFecha.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`,
    })
  }

  return NextResponse.json({ ok: true, nuevaFecha: nuevaFechaStr, syncedRemote })
}
