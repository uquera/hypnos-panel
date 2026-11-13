import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { abrirSesionPos } from "@/lib/pos/sesion"
import { jsonError, mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, intentosRecientes, ipDe, limpiarIntentos } from "@/lib/pos/servidor"

// POST /api/pos-portal/login — ingreso de las sub-cuentas de Hypnos POS.
// 6 intentos fallidos por correo (o 30 por IP) = 15 minutos de espera.

const VENTANA = 15 * 60_000
// Hash cualquiera para comparar aunque el correo no exista (mismo tiempo de respuesta)
const HASH_FALSO = bcrypt.hashSync("hypnos-pos-sin-usuario", 12)

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const body     = await req.json().catch(() => ({}))
  const email    = String(body?.email ?? "").trim().toLowerCase().slice(0, 180)
  const password = String(body?.password ?? "")
  if (!email || !password) return jsonError("Escribe tu correo y tu contraseña.")

  const ip = ipDe(req)
  const claveEmail = `pos-login:e:${email}`
  const claveIp    = `pos-login:i:${ip}`
  if (intentosRecientes(claveEmail, VENTANA) >= 6 || (ip && intentosRecientes(claveIp, VENTANA) >= 30)) {
    return jsonError("Demasiados intentos. Espera 15 minutos y vuelve a probar.", 429)
  }

  const usuario = await prisma.posUsuario.findUnique({ where: { email }, include: { cuenta: true } })
  const ok = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_FALSO)
  if (!usuario || !usuario.passwordHash || !ok || !usuario.activo) {
    excedeLimite(claveEmail, 1_000, VENTANA)
    if (ip) excedeLimite(claveIp, 1_000, VENTANA)
    // ¿Es alguien del equipo Hypnos con su clave del panel? (solo si la clave es correcta,
    // para no revelar qué correos existen)
    if (!usuario) {
      const op = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, activo: true } })
      if (op?.activo && await bcrypt.compare(password, op.passwordHash)) {
        return jsonError("Esta es tu cuenta del panel de Hypnos. Para ver el portal de un cliente, abre su ficha en panel.hypnosapps.com y usa «Ver portal como dueño».", 401)
      }
    }
    return jsonError("Correo o contraseña incorrectos.", 401)
  }
  if (!usuario.cuenta.activo) return jsonError("Esta cuenta está suspendida. Escribe a Hypnos.", 403)

  limpiarIntentos(claveEmail)
  await prisma.posUsuario.update({ where: { id: usuario.id }, data: { ultimoIngreso: new Date() } })
  await abrirSesionPos({ id: usuario.id, passwordHash: usuario.passwordHash })
  return NextResponse.json({ ok: true })
}
