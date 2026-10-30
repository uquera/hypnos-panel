import path from "path"

// Utilidades de servidor de Hypnos POS: carpeta de logos, URL pública,
// IP del cliente y límite de intentos en memoria (un solo proceso PM2).

/** Carpeta de logos, fuera del build. En el VPS: /var/www/hypnos-panel/uploads/pos */
export function dirLogos(): string {
  return process.env.POS_UPLOAD_DIR || path.join(process.cwd(), "uploads", "pos")
}

/**
 * Base pública del panel para armar enlaces absolutos (logo de la app, correos).
 * POS_PUBLIC_URL > AUTH_URL > origen de la petición.
 */
export function basePublica(req?: Request): string {
  const env = process.env.POS_PUBLIC_URL || process.env.AUTH_URL
  if (env) return env.replace(/\/$/, "")
  if (req) {
    const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "")
    if (host) return `${proto}://${host}`
  }
  return "https://panel.hypnosapps.com"
}

export function ipDe(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    ""
  )
}

// ─── Límite de tasa (ventana deslizante) ──────────────────────────────────────

const ventanas = new Map<string, number[]>()
let ultimaLimpieza = Date.now()

/** Registra un intento y devuelve true si la clave pasó el límite. */
export function excedeLimite(clave: string, limite: number, ventanaMs: number): boolean {
  const ahora = Date.now()
  if (ahora - ultimaLimpieza > 10 * 60_000) {
    // Limpieza ocasional para que el mapa no crezca sin fin
    for (const [k, lista] of ventanas) {
      if (!lista.length || ahora - lista[lista.length - 1] > 60 * 60_000) ventanas.delete(k)
    }
    ultimaLimpieza = ahora
  }
  const lista = (ventanas.get(clave) ?? []).filter(t => ahora - t < ventanaMs)
  lista.push(ahora)
  ventanas.set(clave, lista)
  return lista.length > limite
}

/** Consulta sin registrar (para bloquear tras N fallos de contraseña). */
export function intentosRecientes(clave: string, ventanaMs: number): number {
  const ahora = Date.now()
  return (ventanas.get(clave) ?? []).filter(t => ahora - t < ventanaMs).length
}

export function limpiarIntentos(clave: string): void {
  ventanas.delete(clave)
}
