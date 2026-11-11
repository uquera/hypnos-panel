import { NextResponse } from "next/server"
import { appUrl } from "@/lib/tuu-online"
import { crearCobroOnline, tokenPagoValido } from "@/lib/pos/cobro-online"
import { getSesionPos } from "@/lib/pos/sesion"
import { mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/pos-pago/iniciar (formulario HTML) — crea el cobro en línea y devuelve una página
// que reenvía al cliente a TUU con un formulario POST.
//   Portal: sesión del dueño (cookie hypnos_pos), la cuenta sale de la sesión.
//   Link (correo de cobro / WhatsApp): campos c (cuentaId) + t (token HMAC de la cuenta).
//   meses: 1 (mes) | 12 (año) | otro plan configurado. El monto lo calcula SIEMPRE el servidor.
// Los errores vuelven a la página de origen con ?error=. Redirecciones absolutas desde APP_URL, nunca desde Host.
//
// El POST a TUU lo hace el NAVEGADOR, no el servidor: el endpoint de TUU responde 302 a su
// página de pago y esa página valida la cuenta contra la sesión de quien hizo la petición.
// Haciéndolo desde el servidor, el cliente llegaba a "solicitud no válida".

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
    const { endpoint, campos } = await crearCobroOnline({ cuentaId, meses, origen: porLink ? "LINK" : "PORTAL" })
    return new NextResponse(paginaPuente(endpoint, campos), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    })
  } catch (e) {
    if (e instanceof ErrorPos) return volver(e.message)
    console.error("[tuu-licencia] crear cobro:", e)
    return volver("Ocurrió un error inesperado. Intenta de nuevo.")
  }
}

const escapar = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Página puente: envía el formulario a TUU desde el navegador del cliente. */
function paginaPuente(endpoint: string, campos: Record<string, string>): string {
  const inputs = Object.entries(campos)
    .map(([k, v]) => `<input type="hidden" name="${escapar(k)}" value="${escapar(v)}">`)
    .join("")
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Redirigiendo a Webpay…</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;background:#f8fafc;color:#334155}
.c{text-align:center}button{margin-top:1rem;padding:.7rem 1.4rem;border:0;border-radius:.75rem;background:#4f46e5;color:#fff;font-weight:600;font-size:.95rem;cursor:pointer}</style>
</head><body><div class="c">
<p>Te estamos llevando a Webpay para completar el pago…</p>
<form id="f" method="POST" action="${escapar(endpoint)}">${inputs}
<noscript><button type="submit">Continuar al pago</button></noscript>
</form>
<button type="submit" form="f" id="b" hidden>Continuar al pago</button>
<script>
  var f=document.getElementById("f");
  // si el envío automático no ocurre (navegador raro), queda el botón a la vista
  setTimeout(function(){document.getElementById("b").hidden=false},2500);
  f.submit();
</script>
</div></body></html>`
}
