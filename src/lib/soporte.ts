import crypto from "crypto"
import { urlSoporte as urlSoportePos, conAcceso } from "@/lib/pos/acceso"

// "Entrar como admin" (estándar de gobernanza, punto 7): token JWT HS256 firmado con la master key
// del cliente, { soporte: true, por, aud: "hypnos-soporte" }, 2 minutos, un solo uso. El cliente lo canjea
// en <base>/api/gobernanza/soporte y abre la sesión del usuario oculto "Hypnos (soporte)".
// Hypnos POS usa su propio canje (/auto-login, aud "hypnos-pos-acceso"): ver lib/pos/acceso.ts.

const b64 = (v: string) => Buffer.from(v).toString("base64url")

type ClienteSoporte = {
  apiUrl: string
  masterKey: string
  posCuentas: { posUrl: string; estadoAlta: string; eliminadaAt: Date | null }[]
}

/** Base del sistema a partir del apiUrl de la licencia; null si no sigue la ruta estándar. */
export function baseCliente(apiUrl: string): string | null {
  const m = apiUrl.trim().match(/^(https:\/\/[^/]+(?:\/[^?#]*?)?)\/api\/gobernanza\/licencia\/?$/)
  return m ? m[1] : null
}

function firmar(masterKey: string, por: string): string {
  const ahora = Math.floor(Date.now() / 1000)
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64(JSON.stringify({
    soporte: true, por: por.slice(0, 80), aud: "hypnos-soporte", iss: "panel.hypnosapps.com",
    iat: ahora, exp: ahora + 120, jti: crypto.randomBytes(16).toString("hex"),
  }))
  return `${head}.${body}.${crypto.createHmac("sha256", masterKey.trim()).update(`${head}.${body}`).digest("base64url")}`
}

/**
 * URL de un uso para entrar como admin, o el motivo por el que no se puede.
 * Antes de firmar consulta si el sistema tiene el canje (sin token responde 401).
 */
export async function urlSoporteCliente(c: ClienteSoporte, por: string): Promise<{ url: string } | { error: string }> {
  const pos = c.posCuentas.find((p) => !p.eliminadaAt && p.estadoAlta === "LISTO")
  if (pos) {
    const url = conAcceso({ ...pos, cliente: { masterKey: c.masterKey } }) ? urlSoportePos({ ...pos, cliente: { masterKey: c.masterKey } }, por) : null
    return url ? { url } : { error: "Este local de Hypnos POS no tiene acceso de soporte." }
  }
  const base = baseCliente(c.apiUrl)
  if (!base) return { error: "Este sistema no usa la ruta estándar de gobernanza: el acceso de soporte no está disponible." }
  try {
    const r = await fetch(`${base}/api/gobernanza/soporte`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) })
    // el canje responde 401 sin token; 404, una redirección u otra cosa = no lo tiene
    if (r.status !== 401) return { error: "Este sistema todavía no tiene el acceso de soporte (punto 7 del estándar de gobernanza)." }
  } catch {
    return { error: "El sistema no responde. Revisa que esté en línea." }
  }
  return { url: `${base}/api/gobernanza/soporte?token=${encodeURIComponent(firmar(c.masterKey, por))}` }
}
