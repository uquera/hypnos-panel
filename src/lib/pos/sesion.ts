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

// ─── Modo soporte ─────────────────────────────────────────────────────────────
// Un ADMIN del panel entra al portal como el dueño de una cuenta ("Ver portal como dueño").
// El panel (panel.hypnosapps.com) firma un pase de 60 s y un uso; mi.hypnosapps.com lo canjea
// y deja una cookie de soporte de 4 horas: {sop: id del User ADMIN, uid: id del dueño}.
// Al validar la sesión se exige que ese ADMIN siga activo, en vez del hash de la contraseña del
// dueño (que puede no tenerla aún). El dueño no ve nada de esto y su sesión no cambia.
const DURACION_SOPORTE_MS = 4 * 60 * 60_000
const usados = new Map<string, number>()   // jti de pases ya canjeados (un solo proceso pm2)

function firmarPase(payload: string): string {
  return crypto.createHmac("sha256", secreto()).update(`hypnos-pos-pase-soporte.${payload}`).digest("base64url")
}

/** Pase de un uso (60 s) para abrir el portal como el dueño `uid`. Lo firma el panel. */
export function crearPaseSoporte(adminId: string, uid: string): string {
  const payload = Buffer.from(JSON.stringify({
    sop: adminId, uid, exp: Date.now() + 60_000, jti: crypto.randomBytes(12).toString("base64url"),
  })).toString("base64url")
  return `${payload}.${firmarPase(payload)}`
}

/** Canjea el pase y abre la sesión de soporte. Devuelve false si es inválido, venció o ya se usó. */
export async function canjearPaseSoporte(pase: string): Promise<boolean> {
  const [payload, sig] = String(pase ?? "").split(".")
  if (!payload || !sig || pase.length > 600) return false
  const esperada = Buffer.from(firmarPase(payload))
  const recibida = Buffer.from(sig)
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return false
  let data: { sop?: string; uid?: string; exp?: number; jti?: string }
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) } catch { return false }
  if (!data.sop || !data.uid || !data.jti || !data.exp || Date.now() > data.exp) return false
  const ahora = Date.now()
  for (const [k, v] of usados) if (v < ahora) usados.delete(k)
  if (usados.has(data.jti)) return false
  usados.set(data.jti, data.exp)

  const exp = ahora + DURACION_SOPORTE_MS
  const cookie = Buffer.from(JSON.stringify({ uid: data.uid, sop: data.sop, exp, v: "soporte" })).toString("base64url")
  const jar = await cookies()
  jar.set(COOKIE_POS, `${cookie}.${firmar(cookie)}`, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    expires:  new Date(exp),
  })
  return true
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

  let data: { uid?: string; exp?: number; v?: string; sop?: string }
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!data.uid || !data.exp || Date.now() > data.exp) return null

  const usuario = await prisma.posUsuario.findUnique({ where: { id: data.uid }, include: { cuenta: true } })
  if (!usuario) return null

  // Sesión de soporte de Hypnos: vale mientras el ADMIN siga activo (aunque la cuenta esté suspendida,
  // para poder ayudar a reactivarla).
  if (data.sop) {
    const admin = await prisma.user.findUnique({ where: { id: data.sop }, select: { id: true, nombre: true, role: true, activo: true } })
    if (!admin || !admin.activo || admin.role !== "ADMIN" || data.v !== "soporte") return null
    return { ...usuario, soporte: { id: admin.id, nombre: admin.nombre } as { id: string; nombre: string } | null }
  }

  if (!usuario.activo || !usuario.passwordHash || !usuario.cuenta.activo) return null
  if (data.v !== version(usuario.passwordHash)) return null
  return { ...usuario, soporte: null as { id: string; nombre: string } | null }
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
