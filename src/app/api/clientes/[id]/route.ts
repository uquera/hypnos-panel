import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// PATCH — actualizar datos del cliente (solo ADMIN)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const { nombre, dominio, apiUrl, masterKey, emailContacto } = body
  const data: Record<string, unknown> = {}
  if (nombre        !== undefined) data.nombre        = nombre
  if (dominio       !== undefined) data.dominio       = dominio
  if (apiUrl        !== undefined) data.apiUrl        = apiUrl
  if (masterKey     !== undefined) data.masterKey     = masterKey
  if (emailContacto !== undefined) data.emailContacto = emailContacto

  const cliente = await prisma.cliente.update({ where: { id }, data })
  return NextResponse.json({ ok: true, cliente })
}

// DELETE — archivar cliente (activo=false), solo ADMIN
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  await prisma.cliente.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
