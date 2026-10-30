// Reglas compartidas (cliente y servidor) de Hypnos POS. Sin imports de Node.

export const CODIGO_RE = /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/
export const HEX_RE    = /^#[0-9a-f]{6}$/
export const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export const ROLES_POS = ["DUENO", "EDITOR"] as const
export type RolPos = typeof ROLES_POS[number]

export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export interface ColoresPos {
  colorPrimario:      string
  colorTextoPrimario: string
  colorFondo:         string
  colorTexto:         string
}

export const COLORES_DEFECTO: ColoresPos = {
  colorPrimario:      "#f26522",
  colorTextoPrimario: "#ffffff",
  colorFondo:         "#ffffff",
  colorTexto:         "#1f2937",
}

export function normalizarCodigo(v: unknown): string {
  return String(v ?? "").trim().toLowerCase()
}

/** Devuelve el mensaje de error o null si el código sirve. */
export function errorCodigo(codigo: string): string | null {
  if (codigo.length < 3 || codigo.length > 30) return "El código debe tener entre 3 y 30 caracteres."
  if (!CODIGO_RE.test(codigo) || codigo.includes("--")) {
    return "El código solo admite minúsculas, números y guiones (sin guion al inicio ni al final)."
  }
  return null
}

export function normalizarHex(v: unknown): string | null {
  let s = String(v ?? "").trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s.slice(1).split("").map(c => c + c).join("")
  return HEX_RE.test(s) ? s : null
}

/** URL https válida (o null). En desarrollo también acepta http://localhost. */
export function normalizarPosUrl(v: unknown): string | null {
  const s = String(v ?? "").trim()
  try {
    const u = new URL(s)
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1"
    if (u.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) return null
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

// ─── Contraste (WCAG) para avisar si un par de colores no se lee ─────────────

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const canal = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

export function contraste(a: string, b: string): number {
  if (!HEX_RE.test(a) || !HEX_RE.test(b)) return 21
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}
