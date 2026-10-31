import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ErrorPos } from "./usuarios"
import { getSesionPos, type UsuarioPos } from "./sesion"

// Ayudas para las rutas /api/pos-admin (operadores ADMIN de Hypnos, sesión NextAuth)
// y /api/pos-portal (sub-cuentas del negocio, cookie hypnos_pos). Nunca se mezclan.

export function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

/** Convierte ErrorPos en respuesta JSON; el resto se registra y responde 500. */
export async function manejar(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ErrorPos) return jsonError(e.message, e.status)
    console.error("[pos]", e)
    return jsonError("Ocurrió un error inesperado. Intenta de nuevo.", 500)
  }
}

export async function adminPos() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return null
  return session
}

/** Sesión del portal; con soloDueno exige rol DUENO. */
export async function portalPos(soloDueno = false): Promise<UsuarioPos | null> {
  const u = await getSesionPos()
  if (!u || (soloDueno && u.rol !== "DUENO")) return null
  return u
}

/** Las escrituras del portal deben venir del mismo sitio (además de SameSite=Lax). */
export function mismoOrigen(req: Request): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return true
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Operador del panel para registrar pagos/logs: confirma el id en la base (o lo busca por correo). */
export async function operadorDe(session: { user: { id?: string; name?: string | null; email?: string | null } }) {
  const { prisma } = await import("@/lib/prisma")
  const porId = session.user.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, nombre: true } }) : null
  const u = porId ?? (session.user.email ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true, nombre: true } }) : null)
  if (!u) throw new ErrorPos("Tu usuario del panel no existe. Vuelve a iniciar sesión.", 401)
  return { id: u.id, nombre: session.user.name ?? u.nombre }
}
