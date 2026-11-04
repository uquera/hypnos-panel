import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { buscarTokenVigente } from "@/lib/pos/tokens"
import { abrirSesionPos } from "@/lib/pos/sesion"
import { jsonError, mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { sincronizarClave } from "@/lib/pos/acceso"

// POST /api/pos-portal/crear-contrasena — usa un enlace de invitación o recuperación,
// fija la contraseña, anula el enlace y deja la sesión abierta.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const ip = ipDe(req)
  if (ip && excedeLimite(`pos-crear:i:${ip}`, 20, 15 * 60_000)) {
    return jsonError("Demasiados intentos. Espera unos minutos.", 429)
  }

  const body     = await req.json().catch(() => ({}))
  const token    = String(body?.token ?? "")
  const password = String(body?.password ?? "")
  if (password.length < 8 || password.length > 200) {
    return jsonError("La contraseña debe tener al menos 8 caracteres.")
  }

  const registro = await buscarTokenVigente(token)
  if (!registro || !registro.usuario.activo) {
    return jsonError("El enlace no es válido o ya venció. Pide uno nuevo.")
  }
  if (!registro.usuario.cuenta.activo) return jsonError("Esta cuenta está suspendida. Escribe a Hypnos.", 403)

  const passwordHash = await bcrypt.hash(password, 12)
  const usado = await prisma.$transaction(async (tx) => {
    // updateMany con usadoEn: null evita que dos envíos simultáneos usen el mismo enlace
    const r = await tx.posToken.updateMany({ where: { id: registro.id, usadoEn: null }, data: { usadoEn: new Date() } })
    if (r.count !== 1) return false
    await tx.posUsuario.update({ where: { id: registro.usuarioId }, data: { passwordHash, ultimoIngreso: new Date() } })
    // Los demás enlaces pendientes de esa persona dejan de servir
    await tx.posToken.deleteMany({ where: { usuarioId: registro.usuarioId, usadoEn: null } })
    return true
  })
  if (!usado) return jsonError("El enlace ya se usó. Pide uno nuevo.")

  // Una sola contraseña: también sirve para entrar al sistema del local (si allá aún no tiene)
  await sincronizarClave(registro.usuario.cuentaId, registro.usuario.email, passwordHash)
  await abrirSesionPos({ id: registro.usuarioId, passwordHash })
  return NextResponse.json({ ok: true })
}
