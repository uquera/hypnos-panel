// Pago en línea con TUU (Webpay de Haulmer) para cobrar la licencia de Hypnos POS.
// Mismo protocolo que el POS (dona-any-pos, src/lib/tuu-online.ts). Solo servidor: usa la llave secreta.
// Variables de entorno (solo en el .env del VPS, nunca en git):
//   TUU_ONLINE_ACCOUNT_ID  código de comercio que entrega TUU
//   TUU_ONLINE_SECRET      llave secreta (firma HMAC-SHA256)
//   TUU_ONLINE_ENV         "test" (integración, no cobra) | "prod"
// Las URL absolutas (callback, retorno) salen de APP_URL (o POS_PUBLIC_URL / AUTH_URL), nunca de la cabecera Host.
import { createHmac, timingSafeEqual } from "crypto"

const ENDPOINT = {
  test: "https://frontend-api.payment.haulmer.dev/v1/payment",
  prod: "https://core.payment.haulmer.com/api/v1/payment",
} as const

export type TuuOnlineConfig = { accountId: string; secret: string; env: "test" | "prod"; endpoint: string; baseUrl: string }

/** URL pública del panel desde variables de entorno; en desarrollo, localhost. */
export function appUrl(): string | null {
  const u = (process.env.APP_URL || process.env.POS_PUBLIC_URL || process.env.AUTH_URL || "").trim().replace(/\/+$/, "")
  if (/^https?:\/\/\S+$/.test(u)) return u
  if (process.env.NODE_ENV === "production") return null
  return `http://localhost:${process.env.PORT ?? 3000}`
}

/** Configuración completa o null (el botón "Pagar en línea" no aparece y queda el link fijo). */
export function tuuOnlineConfig(): TuuOnlineConfig | null {
  const accountId = process.env.TUU_ONLINE_ACCOUNT_ID?.trim()
  const secret = process.env.TUU_ONLINE_SECRET?.trim()
  const env = process.env.TUU_ONLINE_ENV?.trim()
  const baseUrl = appUrl()
  if (!accountId || !secret || (env !== "test" && env !== "prod") || !baseUrl) return null
  return { accountId, secret, env, endpoint: ENDPOINT[env], baseUrl }
}

export const tuuOnlineEnabled = () => tuuOnlineConfig() !== null

/** Firma TUU: HMAC-SHA256 (hex) de los campos x_* sin x_signature, ordenados y concatenados clave+valor. */
export function tuuSign(fields: Record<string, string | number | null | undefined>, secret: string): string {
  const base = Object.keys(fields)
    .filter(k => k.startsWith("x_") && k !== "x_signature")
    .sort()
    .map(k => k + (fields[k] ?? ""))
    .join("")
  return createHmac("sha256", secret).update(base, "utf8").digest("hex")
}

/** Verifica x_signature en tiempo constante. */
export function tuuVerify(fields: Record<string, string>, secret: string): boolean {
  const got = (fields.x_signature ?? "").trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(got)) return false
  const want = Buffer.from(tuuSign(fields, secret), "hex")
  return timingSafeEqual(Buffer.from(got, "hex"), want)
}

/** Texto plano corto y sin caracteres raros (TUU firma en UTF-8, pero mejor no arriesgar). */
export function plain(s: string, max: number) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 #.,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/** "Juana Pérez Soto" → { first: "Juana", last: "Perez Soto" }; sin apellido, "-". */
export function splitName(name: string) {
  const parts = plain(name, 80).split(" ").filter(Boolean)
  return { first: (parts[0] ?? "Cliente").slice(0, 40), last: parts.slice(1).join(" ").slice(0, 40) || "-" }
}

/** Celular chileno en formato +569XXXXXXXX, o "" si no se puede normalizar. */
export function telefonoCl(v: string): string {
  let d = (v ?? "").replace(/\D/g, "")
  if (d.length === 8) d = "9" + d
  if (d.length === 9 && d.startsWith("9")) d = "56" + d
  return /^569\d{8}$/.test(d) ? `+${d}` : ""
}

export type TuuIntentInput = {
  amount: number
  reference: string
  description: string
  shopName: string
  customerName: string
  email: string
  phone: string // +569…
  /** Rutas relativas a baseUrl. */
  callbackPath: string
  completePath: string
  cancelPath: string
}

/**
 * Campos firmados del intento de pago.
 *
 * El POST lo hace el NAVEGADOR del cliente, no el servidor: el endpoint de TUU responde
 * siempre 302 a su página de pago (ignora `X-REDIRECT: false`) y esa página valida la
 * cuenta contra la sesión de quien hizo la petición. Si el POST sale del servidor, el
 * cliente llega a la página sin sesión y ve "solicitud no válida".
 * Comprobado el 11-nov-2026 contra el ambiente de pruebas: firma correcta, firma alterada,
 * cuenta inventada y sin firma devuelven exactamente la misma redirección.
 */
export function camposIntento(cfg: TuuOnlineConfig, i: TuuIntentInput): Record<string, string> {
  const { first, last } = splitName(i.customerName)
  const campos: Record<string, string | number> = {
    x_account_id: cfg.accountId,
    x_amount: Math.round(i.amount),
    x_currency: "CLP",
    x_customer_email: i.email,
    x_customer_first_name: first,
    x_customer_last_name: last,
    x_customer_phone: i.phone,
    x_description: plain(i.description, 60),
    x_reference: i.reference,
    x_shop_name: plain(i.shopName, 40) || "Hypnos POS",
    x_url_callback: `${cfg.baseUrl}${i.callbackPath}`,
    x_url_cancel: `${cfg.baseUrl}${i.cancelPath}`,
    x_url_complete: `${cfg.baseUrl}${i.completePath}`,
  }
  campos.x_signature = tuuSign(campos, cfg.secret)
  return Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, String(v)]))
}
