import { NextResponse } from "next/server"
import { appUrl } from "@/lib/tuu-online"
import { tokenPagoValido } from "@/lib/pos/cobro-online"
import { crearSuscripcion } from "@/lib/pos/mp-suscripcion"
import { mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/pos-pago/mp-suscripcion (formulario HTML del link de pago /pos/pagar, sin sesión).
// Campos: c (cuentaId) + t (token HMAC de la cuenta) + email (cuenta de Mercado Pago del pagador).
// Crea (o reutiliza) la suscripción mensual de Mercado Pago de la cuenta y redirige a Mercado Pago
// para autorizar la tarjeta. El monto lo calcula siempre el servidor (precio del plan).
export async function POST(req: Request) {
  const base = appUrl() ?? "https://panel.hypnosapps.com"
  const fd = await req.formData().catch(() => null)
  const c = String(fd?.get("c") ?? "")
  const t = String(fd?.get("t") ?? "")
  const email = String(fd?.get("email") ?? "")
  const volver = (error: string) =>
    NextResponse.redirect(`${base}/pos/pagar?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}&error=${encodeURIComponent(error)}`, 303)

  if (!mismoOrigen(req)) return volver("Solicitud no válida.")
  if (excedeLimite(`pos-sus-link:${ipDe(req)}`, 10, 60 * 60_000)) return volver("Demasiados intentos. Espera unos minutos.")
  if (!tokenPagoValido(c, t)) return volver("El link de pago no es válido. Pídenos uno nuevo a contacto@hypnosapps.com.")

  try {
    const sus = await crearSuscripcion({ cuentaId: c, email, creadoPor: `link:${email.trim().toLowerCase()}`.slice(0, 120) })
    if (!sus.initPoint) return volver("Mercado Pago no entregó el link. Intenta de nuevo en unos minutos.")
    return NextResponse.redirect(sus.initPoint, 303)
  } catch (e) {
    if (e instanceof ErrorPos) return volver(e.message)
    console.error("[mp-suscripcion] link de pago:", e)
    return volver("Ocurrió un error inesperado. Intenta de nuevo.")
  }
}
