import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { verificarTokenReset } from "@/lib/password-reset"
import { logActividad } from "@/lib/actividad"

// POST /api/restablecer — fija una nueva contraseña con un enlace válido.
export async function POST(req: Request) {
  let token = "", password = ""
  try {
    const body = await req.json()
    token = String(body?.token ?? "")
    password = String(body?.password ?? "")
  } catch {
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 })
  }

  const user = await verificarTokenReset(token)
  if (!user) {
    return NextResponse.json({ error: "El enlace no es válido o ya venció. Pide uno nuevo." }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  await logActividad({
    usuarioId:     user.id,
    usuarioNombre: user.nombre,
    accion:        "PASSWORD_RESTABLECIDO",
    detalle:       "Contraseña restablecida con enlace de recuperación por correo",
  })

  return NextResponse.json({ ok: true })
}
