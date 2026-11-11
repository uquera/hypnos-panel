import { NextResponse } from "next/server"
import { appUrl } from "@/lib/tuu-online"
import { crearCobroOnline, tokenPagoValido } from "@/lib/pos/cobro-online"
import { getSesionPos } from "@/lib/pos/sesion"
import { mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/pos-pago/iniciar (formulario HTML) — crea el cobro en línea y redirige a TUU (303).
//   Portal: sesión del dueño (cookie hypnos_pos), la cuenta sale de la sesión.
//   Link (correo de cobro / WhatsApp): campos c (cuentaId) + t (token HMAC de la cuenta).
//   meses: 1 (mes) | 12 (año) | otro plan configurado. El monto lo calcula SIEMPRE el servidor.
// Los errores vuelven a la página de origen con ?error=. Redirecciones absolutas desde APP_URL, nunca desde Host.

export async function POST(req: Request) {
  const base = appUrl() ?? "https://panel.hypnosapps.com"
  const fd = await req.formData().catch(() => null)
  const c = String(fd?.get("c") ?? "")
  const t = String(fd?.get("t") ?? "")
  const meses = Number(fd?.get("meses") ?? 1)
  const porLink = Boolean(c && t)
  const volver = (error: string) => {
    const dest = porLink
      ? `/pos/pagar?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}&error=${encodeURIComponent(error)}`
      : `/pos/pago?error=${encodeURIComponent(error)}`
    return NextResponse.redirect(`${base}${dest}`, 303)
  }

  if (!mismoOrigen(req)) return volver("Solicitud no válida.")
  if (excedeLimite(`pos-pago:${ipDe(req)}`, 10, 10 * 60_000)) return volver("Demasiados intentos. Espera unos minutos.")

  let cuentaId: string
  if (porLink) {
    if (!tokenPagoValido(c, t)) return volver("El link de pago no es válido. Pídenos uno nuevo a contacto@hypnosapps.com.")
    cuentaId = c
  } else {
    const yo = await getSesionPos()
    if (!yo || yo.rol !== "DUENO") return NextResponse.redirect(`${base}/pos/login?next=/pos/pago`, 303)
    cuentaId = yo.cuentaId
  }

  try {
    const { url } = await crearCobroOnline({ cuentaId, meses, origen: porLink ? "LINK" : "PORTAL" })
    return NextResponse.redirect(url, 303)
  } catch (e) {
    if (e instanceof ErrorPos) return volver(e.message)
    console.error("[tuu-licencia] crear cobro:", e)
    return volver("Ocurrió un error inesperado. Intenta de nuevo.")
  }
}
