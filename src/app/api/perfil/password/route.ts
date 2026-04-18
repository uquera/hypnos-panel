import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { actual, nueva } = await req.json()

  if (!actual || !nueva || nueva.length < 8) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  // Busca por id si está disponible, si no por email (compatibilidad con sesiones antiguas)
  const where = session.user.id
    ? { id: session.user.id }
    : { email: session.user.email! }

  const user = await prisma.user.findUnique({ where })
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })

  const valida = await bcrypt.compare(actual, user.passwordHash)
  if (!valida) return NextResponse.json({ error: "La contraseña actual es incorrecta" }, { status: 400 })

  const passwordHash = await bcrypt.hash(nueva, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  return NextResponse.json({ ok: true })
}
