// Puente OAuth de Google para los clientes finales de los POS (otros dominios).
//
// Un solo cliente OAuth de Hypnos (GOOGLE_CLIENTE_ID) con una sola URI de retorno en el panel:
//   local → /api/cliente-google/start?return=https://<local>/cliente/google
//         → Google → /api/cliente-google/callback → https://<local>/cliente/google?token=<jwt>
// El JWT corto (HS256, 120 s, aud = host del local) lo firma el panel con
// HYPNOS_CLIENTE_GOOGLE_SECRET, la misma clave que tienen los POS para verificarlo.
// Aquí solo funciones puras (sin Prisma ni fetch) para poder probarlas.

import crypto from "node:crypto"

export const COOKIE_NOMBRE = "hypnos_cliente_google"
export const COOKIE_PATH = "/api/cliente-google"
export const COOKIE_TTL_MS = 10 * 60 * 1000
export const TOKEN_TTL_S = 120
export const TOKEN_ISS = "panel.hypnosapps.com"
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
const GOOGLE_ISS = new Set(["https://accounts.google.com", "accounts.google.com"])

// ─── utilidades ───────────────────────────────────────────────────────────────

export const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url")
export const aleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url")

function hmac(secret: string, data: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url")
}

/** Comparación en tiempo constante de dos strings (false si largos distintos). */
export function igualSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

/** PKCE S256: code_challenge = base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url")
}

/** u***@gmail.com — para logs. */
export function enmascararCorreo(email: string): string {
  const [usuario, dominio] = (email ?? "").split("@")
  if (!dominio) return "***"
  return `${usuario.slice(0, 1)}***@${dominio}`
}

/** Host normalizado (minúsculas, sin puerto ni www.) desde una URL o un dominio suelto. */
export function hostDe(valor: string | null | undefined): string | null {
  const v = (valor ?? "").trim()
  if (!v) return null
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`)
    return u.hostname.toLowerCase().replace(/^www\./, "") || null
  } catch {
    return null
  }
}

// ─── locales permitidos ─────────────────────────────────────────────────────────

/** Hosts permitidos (sin www) a partir de los datos del panel. Siempre incluye donnaany.com. */
export function hostsPermitidos(datos: {
  clientes: { dominio: string; apiUrl: string }[]
  posCuentas: { codigo: string; posUrl: string }[]
}): Set<string> {
  const hosts = new Set<string>(["donnaany.com"])
  const add = (v: string | null) => { if (v) hosts.add(v) }
  for (const c of datos.clientes) { add(hostDe(c.dominio)); add(hostDe(c.apiUrl)) }
  for (const p of datos.posCuentas) {
    add(hostDe(p.posUrl))
    // la instancia automática vive en <codigo>.hypnosapps.com (hypnos-pos-tenant)
    if (/^[a-z0-9-]{3,30}$/.test(p.codigo)) hosts.add(`${p.codigo}.hypnosapps.com`)
  }
  return hosts
}

/**
 * Valida la URL de retorno: https, sin credenciales, host conocido (con o sin www)
 * y path que termina en /cliente/google (se admite basePath, ej. /pos/cliente/google).
 * Devuelve la URL normalizada o null.
 */
export function allowedReturn(url: string | null | undefined, hosts: Set<string>): URL | null {
  if (!url) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== "https:") return null
  if (u.username || u.password) return null
  if (u.port && u.port !== "443") return null
  const host = u.hostname.toLowerCase().replace(/^www\./, "")
  if (!hosts.has(host)) return null
  if (!/^(\/[A-Za-z0-9_-]+)*\/cliente\/google\/?$/.test(u.pathname)) return null
  u.hash = ""
  return u
}

/** Agrega parámetros a la URL de retorno (con ? o & según corresponda). */
/**
 * Como conParametros, pero en el fragmento (#token=…): el navegador no lo envía al servidor, así que el
 * token no queda en los registros de nginx ni en el historial del servidor del local.
 */
export function conFragmento(retorno: string, params: Record<string, string>): string {
  const u = new URL(retorno)
  u.hash = new URLSearchParams(params).toString()
  return u.toString()
}

export function conParametros(retorno: string, params: Record<string, string>): string {
  const u = new URL(retorno)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

// ─── cookie firmada ─────────────────────────────────────────────────────────────

export type EstadoCookie = { return: string; state: string; nonce: string; verifier: string; exp: number }

export function signCookie(datos: EstadoCookie, secret: string): string {
  const cuerpo = b64url(JSON.stringify(datos))
  return `${cuerpo}.${hmac(secret, cuerpo)}`
}

export function readCookie(valor: string | null | undefined, secret: string, now = Date.now()): EstadoCookie | null {
  if (!valor) return null
  const partes = valor.split(".")
  if (partes.length !== 2) return null
  const [cuerpo, firma] = partes
  if (!igualSeguro(firma, hmac(secret, cuerpo))) return null
  try {
    const d = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as EstadoCookie
    if (typeof d.exp !== "number" || d.exp <= now) return null
    if (![d.return, d.state, d.nonce, d.verifier].every((x) => typeof x === "string" && x)) return null
    return d
  } catch {
    return null
  }
}

// ─── JWT local para el POS ──────────────────────────────────────────────────────

export type PerfilGoogle = { sub: string; email: string; name?: string; picture?: string }

export function signLocalToken(perfil: PerfilGoogle, aud: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const header = { alg: "HS256", typ: "JWT" }
  const claims: Record<string, unknown> = {
    sub: perfil.sub,
    email: perfil.email,
    name: perfil.name ?? "",
    ...(perfil.picture ? { picture: perfil.picture } : {}),
    aud,
    iss: TOKEN_ISS,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_S,
    jti: aleatorio(16),
  }
  const datos = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  return `${datos}.${hmac(secret, datos)}`
}

// ─── verificación del id_token de Google ───────────────────────────────────────

export type Jwk = { kid?: string; kty: string; alg?: string; n?: string; e?: string; use?: string }

export class ErrorIdToken extends Error {}

function decodificarParte<T>(parte: string): T {
  return JSON.parse(Buffer.from(parte, "base64url").toString("utf8")) as T
}

/**
 * Verifica un id_token de Google (RS256). `jwks` puede ser la lista de claves o una función
 * que la obtiene (recibe el kid para poder recargar la caché si no está). Lanza ErrorIdToken.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string; nonce: string; jwks: Jwk[] | ((kid: string) => Promise<Jwk[]>); now?: number },
): Promise<PerfilGoogle> {
  const partes = (idToken ?? "").split(".")
  if (partes.length !== 3) throw new ErrorIdToken("formato")
  let header: { alg?: string; kid?: string }
  let claims: Record<string, unknown>
  try {
    header = decodificarParte(partes[0])
    claims = decodificarParte(partes[1])
  } catch {
    throw new ErrorIdToken("formato")
  }
  if (header.alg !== "RS256" || !header.kid) throw new ErrorIdToken("alg")

  const claves = typeof opts.jwks === "function" ? await opts.jwks(header.kid) : opts.jwks
  const jwk = claves.find((k) => k.kid === header.kid)
  if (!jwk) throw new ErrorIdToken("kid")
  let ok = false
  try {
    const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" })
    ok = crypto.verify("RSA-SHA256", Buffer.from(`${partes[0]}.${partes[1]}`), key, Buffer.from(partes[2], "base64url"))
  } catch {
    ok = false
  }
  if (!ok) throw new ErrorIdToken("firma")

  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
  if (typeof claims.iss !== "string" || !GOOGLE_ISS.has(claims.iss)) throw new ErrorIdToken("iss")
  if (claims.aud !== opts.clientId) throw new ErrorIdToken("aud")
  if (typeof claims.exp !== "number" || claims.exp + 60 <= nowSec) throw new ErrorIdToken("exp")
  if (typeof claims.nonce !== "string" || !igualSeguro(claims.nonce, opts.nonce)) throw new ErrorIdToken("nonce")
  if (claims.email_verified !== true) throw new ErrorIdToken("email_verified")
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") throw new ErrorIdToken("claims")

  return {
    sub: claims.sub,
    email: claims.email,
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  }
}

// ─── configuración ────────────────────────────────────────────────────────────

export function configClienteGoogle() {
  const clientId = process.env.GOOGLE_CLIENTE_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENTE_SECRET?.trim()
  const secret = process.env.HYPNOS_CLIENTE_GOOGLE_SECRET?.trim()
  if (!clientId || !clientSecret || !secret) return null
  return { clientId, clientSecret, secret, redirectUri: REDIRECT_URI }
}

// URI de retorno registrada en Google Cloud (el repo no tiene PANEL_PUBLIC_URL).
export const REDIRECT_URI = "https://panel.hypnosapps.com/api/cliente-google/callback"

// ─── JWKS de Google con caché en memoria (1 h; recarga si falta el kid) ─────────

let cacheJwks: { claves: Jwk[]; hasta: number } | null = null

export async function jwksGoogle(kid: string): Promise<Jwk[]> {
  const ahora = Date.now()
  if (cacheJwks && cacheJwks.hasta > ahora && cacheJwks.claves.some((k) => k.kid === kid)) return cacheJwks.claves
  const res = await fetch(GOOGLE_JWKS_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new ErrorIdToken(`jwks ${res.status}`)
  const data = (await res.json()) as { keys?: Jwk[] }
  cacheJwks = { claves: Array.isArray(data.keys) ? data.keys : [], hasta: ahora + 60 * 60 * 1000 }
  return cacheJwks.claves
}
