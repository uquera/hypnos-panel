import crypto from "crypto"
import { prisma } from "@/lib/prisma"

// Puente portal → sistema del restaurante (<codigo>.hypnosapps.com).
//  - "Abrir mi sistema": token JWT HS256 firmado con la master key de la gobernanza
//    (la misma que tiene el local en GOBERNANZA_MASTER_KEY), 2 minutos, un solo uso (jti).
//    El POS lo canjea en /auto-login y deja la sesión abierta.
//  - Una sola contraseña: al crearla en el portal se manda el hash al POS
//    (/api/gobernanza/clave), que la usa solo si ese usuario aún no tiene contraseña.
// Solo para locales instalados por el alta automática (estadoAlta LISTO); los MANUAL
// (p. ej. Doña Any) no comparten la master key y abren el link normal.

const AUDIENCIA = "hypnos-pos-acceso"

type CuentaAcceso = { posUrl: string; estadoAlta: string; cliente: { masterKey: string } | null }

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url")

export function conAcceso(c: CuentaAcceso | null | undefined): c is CuentaAcceso & { cliente: { masterKey: string } } {
  return !!c && c.estadoAlta === "LISTO" && !!c.cliente?.masterKey && /^https:\/\//.test(c.posUrl)
}

function firmar(masterKey: string, email: string): string {
  const ahora = Math.floor(Date.now() / 1000)
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64(JSON.stringify({
    posEmail: email.trim().toLowerCase(), aud: AUDIENCIA, iss: "panel.hypnosapps.com",
    iat: ahora, exp: ahora + 120, jti: crypto.randomBytes(16).toString("hex"),
  }))
  const firma = crypto.createHmac("sha256", masterKey.trim()).update(`${head}.${body}`).digest("base64url")
  return `${head}.${body}.${firma}`
}

const base = (c: CuentaAcceso) => c.posUrl.replace(/\/+$/, "")

/** Link de un uso que abre el sistema con la sesión de ese correo; sin acceso, el link normal. */
export function urlAbrirSistema(c: CuentaAcceso, email: string, ir?: string | null): string {
  // ir: pantalla del sistema a abrir (solo rutas internas, p. ej. /configuracion/impresoras)
  const destino = ir && /^\/[a-z0-9/_-]*$/i.test(ir) && !ir.startsWith("//") ? ir : ""
  if (!conAcceso(c)) return destino ? `${base(c)}${destino}` : c.posUrl
  return `${base(c)}/auto-login?token=${encodeURIComponent(firmar(c.cliente.masterKey, email))}${destino ? `&next=${encodeURIComponent(destino)}` : ""}`
}

/** Manda el hash al POS para que la contraseña del portal sirva también en el sistema. Nunca lanza. */
export async function sincronizarClave(cuentaId: string, email: string, passwordHash: string): Promise<boolean> {
  try {
    const c = await prisma.posCuenta.findUnique({ where: { id: cuentaId }, select: { posUrl: true, estadoAlta: true, cliente: { select: { masterKey: true } } } })
    if (!conAcceso(c)) return false
    const res = await fetch(`${base(c)}/api/gobernanza/clave`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Master-Key": c.cliente.masterKey },
      body: JSON.stringify({ email, passwordHash }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.warn(`[pos-acceso] clave en ${c.posUrl}: HTTP ${res.status}`)
    return res.ok
  } catch (e) {
    console.warn("[pos-acceso] no se pudo sincronizar la clave:", e instanceof Error ? e.message : e)
    return false
  }
}
