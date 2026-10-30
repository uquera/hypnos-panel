import { prisma } from "@/lib/prisma"
import { crearToken } from "./tokens"
import { enviarInvitacionPos } from "./email"
import { EMAIL_RE, ROLES_POS, type RolPos } from "./validacion"

// Lógica compartida de sub-cuentas: la usan el panel de Hypnos (/api/pos-admin)
// y el DUENO desde el portal (/api/pos-portal). Cada ruta decide antes los permisos.

export class ErrorPos extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

export interface DatosInvitacion { nombre: unknown; email: unknown; rol: unknown }

export function leerInvitacion(body: DatosInvitacion, rolesPermitidos: readonly RolPos[] = ROLES_POS) {
  const nombre = String(body.nombre ?? "").trim().slice(0, 80)
  const email  = String(body.email ?? "").trim().toLowerCase().slice(0, 180)
  const rol    = String(body.rol ?? "EDITOR") as RolPos
  if (!nombre) throw new ErrorPos("Escribe el nombre.")
  if (!EMAIL_RE.test(email)) throw new ErrorPos("Escribe un correo válido.")
  if (!rolesPermitidos.includes(rol)) throw new ErrorPos("Rol no permitido.")
  return { nombre, email, rol }
}

/** Crea el PosUsuario invitado y le envía el enlace (7 días). */
export async function invitarUsuario(
  cuentaId: string,
  datos: { nombre: string; email: string; rol: RolPos },
  invitadoPor: string,
  base: string,
) {
  const cuenta = await prisma.posCuenta.findUnique({ where: { id: cuentaId } })
  if (!cuenta) throw new ErrorPos("Cuenta no encontrada.", 404)

  const existe = await prisma.posUsuario.findUnique({ where: { email: datos.email } })
  if (existe) {
    throw new ErrorPos(existe.cuentaId === cuentaId
      ? "Ese correo ya tiene acceso a esta cuenta. Usa «Reenviar invitación»."
      : "Ese correo ya tiene acceso a otra cuenta de Hypnos POS.", 409)
  }

  const usuario = await prisma.posUsuario.create({ data: { cuentaId, ...datos } })
  const enviado = await enviarInvitacion(usuario.id, invitadoPor, base)
  return { usuario, enviado }
}

/** Genera un enlace nuevo (anula el anterior) y lo envía. Devuelve false si el correo falló. */
export async function enviarInvitacion(usuarioId: string, invitadoPor: string, base: string): Promise<boolean> {
  const usuario = await prisma.posUsuario.findUnique({ where: { id: usuarioId }, include: { cuenta: true } })
  if (!usuario) throw new ErrorPos("Usuario no encontrado.", 404)
  if (!usuario.activo) throw new ErrorPos("El usuario está desactivado. Actívalo antes de reenviar.")

  const token = await crearToken(usuario.id, "INVITACION")
  const link  = `${base}/pos/crear-contrasena?token=${encodeURIComponent(token)}`
  try {
    await enviarInvitacionPos({
      nombre: usuario.nombre, email: usuario.email, link, invitadoPor, rol: usuario.rol, cuenta: usuario.cuenta,
    })
    return true
  } catch (err) {
    console.error("[pos] no se pudo enviar la invitación:", err)
    return false
  }
}

export type EstadoUsuarioPos = "INVITADO" | "ACTIVO" | "DESACTIVADO"

export function estadoUsuario(u: { activo: boolean; passwordHash: string | null }): EstadoUsuarioPos {
  if (!u.activo) return "DESACTIVADO"
  return u.passwordHash ? "ACTIVO" : "INVITADO"
}

/** Lo que ve el navegador de cada sub-cuenta (sin hash). */
export function usuarioPublico(u: {
  id: string; nombre: string; email: string; rol: string; activo: boolean
  passwordHash: string | null; ultimoIngreso: Date | null; createdAt: Date
}) {
  return {
    id: u.id, nombre: u.nombre, email: u.email, rol: u.rol,
    estado: estadoUsuario(u),
    ultimoIngreso: u.ultimoIngreso?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }
}

export type UsuarioPosPublico = ReturnType<typeof usuarioPublico>
