import crypto from "crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"

// Sesión del portal de clientes de Hypnos POS (/pos/*).
// Es independiente de NextAuth a propósito: otra cookie (hypnos_pos), otra firma
// y otra tabla, así un PosUsuario nunca obtiene una sesión del panel ni al revés.
// Cookie = base64url({uid, exp, v}) + "." + HMAC. "v" sale del hash de la contraseña:
// al cambiarla se cierran las demás sesiones.

export const COOKIE_POS = "hypnos_pos"
const DURACION_MS = 7 * 24 * 60 * 60_000

function secreto(): string {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!s) throw new Error("Falta NEXTAUTH_SECRET")
  return s
}

function firmar(payload: string): string {
  return crypto.createHmac("sha256", secreto()).update(`hypnos-pos-sesion.${payload}`).digest("base64url")
}

function version(passwordHash: string): string {
  return crypto.createHash("sha256").update(passwordHash).digest("base64url").slice(0, 12)
}

export async function abrirSesionPos(usuario: { id: string; passwordHash: string }) {
  const exp     = Date.now() + DURACION_MS
  const payload = Buffer.from(JSON.stringify({ uid: usuario.id, exp, v: version(usuario.passwordHash) })).toString("base64url")
  const jar = await cookies()
  jar.set(COOKIE_POS, `${payload}.${firmar(payload)}`, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    expires:  new Date(exp),
  })
}

export async function cerrarSesionPos() {
  const jar = await cookies()
  jar.delete(COOKIE_POS)
}

/** Usuario del portal con su cuenta, o null si no hay sesión válida. */
export async function getSesionPos() {
  const jar = await cookies()
  const valor = jar.get(COOKIE_POS)?.value ?? ""
  const [payload, sig] = valor.split(".")
  if (!payload || !sig) return null

  const esperada = Buffer.from(firmar(payload))
  const recibida = Buffer.from(sig)
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null

  let data: { uid?: string; exp?: number; v?: string }
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!data.uid || !data.exp || Date.now() > data.exp) return null

  const usuario = await prisma.posUsuario.findUnique({ where: { id: data.uid }, include: { cuenta: true } })
  if (!usuario || !usuario.activo || !usuario.passwordHash || !usuario.cuenta.activo) return null
  if (data.v !== version(usuario.passwordHash)) return null
  return usuario
}

export type UsuarioPos = NonNullable<Awaited<ReturnType<typeof getSesionPos>>>

/** Para páginas del portal: sin sesión → /pos/login (con ?next= para volver a la página). */
export async function requireSesionPos(next?: string): Promise<UsuarioPos> {
  const usuario = await getSesionPos()
  if (!usuario) redirect(next ? `/pos/login?next=${encodeURIComponent(next)}` : "/pos/login")
  return usuario
}

/** Destino seguro tras el login: solo rutas internas del portal. */
export function destinoPortal(next: unknown): string {
  const s = String(next ?? "")
  return /^\/pos\/[a-z0-9/-]*$/i.test(s) && !s.startsWith("//") ? s : "/pos/inicio"
}
