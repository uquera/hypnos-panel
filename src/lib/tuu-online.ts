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
 * Crea el intento de pago en TUU y devuelve la URL a la que se redirige al cliente.
 * Con X-REDIRECT: false TUU responde 200 con la URL en texto plano.
 */
export async function createTuuPayment(cfg: TuuOnlineConfig, i: TuuIntentInput): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { first, last } = splitName(i.customerName)
  const body: Record<string, string | number> = {
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
  body.x_signature = tuuSign(body, cfg.secret)

  try {
    const res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-REDIRECT": "false" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    })
    const text = (await res.text()).trim()
    // la respuesta es la URL en texto plano; por si viniera en JSON, también se acepta { url }
    let url = text.replace(/^"|"$/g, "")
    if (url.startsWith("{")) {
      try {
        const j = JSON.parse(text) as Record<string, unknown>
        url = String(j.url ?? j.payment_url ?? j.redirect_url ?? "")
      } catch { url = "" }
    }
    if (!res.ok || !/^https:\/\/\S+$/.test(url)) {
      console.error("[tuu-licencia] no se pudo crear el intento", { referencia: i.reference, status: res.status, body: text.slice(0, 300) })
      return { ok: false, error: "No pudimos iniciar el pago en línea. Intenta de nuevo o paga por transferencia." }
    }
    console.info("[tuu-licencia] intento creado", { referencia: i.reference, monto: body.x_amount, env: cfg.env })
    return { ok: true, url }
  } catch (err) {
    console.error("[tuu-licencia] error de red al crear el intento", { referencia: i.reference, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: "No pudimos conectar con Webpay. Intenta de nuevo en unos segundos." }
  }
}
