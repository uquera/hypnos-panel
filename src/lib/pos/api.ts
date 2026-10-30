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
