import nodemailer from "nodemailer"

// Correos de Hypnos POS (invitaciones y recuperación) con el estándar Hypnos:
// salen desde no-reply@hypnosapps.com autenticando con contacto@ y las respuestas
// van a contacto@hypnosapps.com. Variables EMAIL_* (o las SMTP_* que ya usa el panel).
// Sin credenciales en desarrollo: el enlace se escribe en la consola en vez de enviarse.

const FROM     = () => process.env.POS_EMAIL_FROM     || '"Hypnos POS" <no-reply@hypnosapps.com>'
const REPLY_TO = () => process.env.POS_EMAIL_REPLY_TO || "contacto@hypnosapps.com"

function credenciales() {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS
  return user && pass ? { user, pass } : null
}

let transporter: nodemailer.Transporter | null = null
function getTransporter(auth: { user: string; pass: string }) {
  transporter ??= nodemailer.createTransport(
    {
      host:   process.env.EMAIL_HOST || "smtp.gmail.com",
      port:   Number(process.env.EMAIL_PORT || 587),
      secure: Number(process.env.EMAIL_PORT || 587) === 465,
      auth,
    },
    { from: FROM(), replyTo: REPLY_TO() },
  )
  return transporter
}

async function enviar(to: string, subject: string, html: string, link: string) {
  const auth = credenciales()
  if (!auth) {
    if (process.env.NODE_ENV === "production") throw new Error("Faltan EMAIL_USER/EMAIL_PASS")
    console.warn(`[pos-email] sin SMTP configurado; no se envía a ${to}. Enlace: ${link}`)
    return
  }
  await getTransporter(auth).sendMail({ to, subject, html })
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))

function plantilla(o: {
  titulo: string; saludo: string; cuerpo: string; boton: string; link: string; pie: string
  color: string; colorTexto: string
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#111827;padding:26px 32px;">
      <span style="color:rgba(255,255,255,0.75);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Hypnos POS</span>
      <h1 style="color:#ffffff;font-size:21px;font-weight:700;margin:8px 0 0;">${o.titulo}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 14px;">${o.saludo}</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">${o.cuerpo}</p>
      <p style="text-align:center;margin:0 0 24px;">
        <a href="${o.link}" style="display:inline-block;background:${o.color};color:${o.colorTexto};font-weight:600;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px;">${o.boton}</a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">${o.pie}</p>
      <p style="color:#9ca3af;font-size:12px;margin:0;word-break:break-all;">¿El botón no funciona? Copia este enlace: ${o.link}</p>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;">
      <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">Hypnos POS · ¿Dudas? Responde este correo o escribe a contacto@hypnosapps.com</p>
    </div>
  </div>
</body>
</html>`
}

interface Datos {
  nombre: string; email: string; link: string
  cuenta: { nombre: string; colorPrimario: string; colorTextoPrimario: string }
}

export async function enviarInvitacionPos(d: Datos & { invitadoPor: string; rol: string }) {
  const html = plantilla({
    titulo: `Te invitaron a ${esc(d.cuenta.nombre)}`,
    saludo: `Hola, <strong>${esc(d.nombre)}</strong>:`,
    cuerpo: `${esc(d.invitadoPor)} te dio acceso para administrar la marca de <strong>${esc(d.cuenta.nombre)}</strong> en la app Hypnos POS (logo, colores y nombre que se ven en la máquina de pago)${d.rol === "DUENO" ? ", y para invitar a tu equipo" : ""}. Crea tu contraseña para entrar:`,
    boton:  "Crear mi contraseña",
    link:   d.link,
    pie:    "El enlace vence en <strong>7 días</strong> y sirve una sola vez. Si no esperabas esta invitación, ignora este correo.",
    color:  d.cuenta.colorPrimario, colorTexto: d.cuenta.colorTextoPrimario,
  })
  await enviar(d.email, `Tu acceso a ${d.cuenta.nombre} en Hypnos POS`, html, d.link)
}

export async function enviarRecuperacionPos(d: Datos) {
  const html = plantilla({
    titulo: "Restablecer tu contraseña",
    saludo: `Hola, <strong>${esc(d.nombre)}</strong>:`,
    cuerpo: `Recibimos una solicitud para restablecer tu contraseña de Hypnos POS (${esc(d.cuenta.nombre)}). Haz clic en el botón para elegir una nueva:`,
    boton:  "Elegir nueva contraseña",
    link:   d.link,
    pie:    "El enlace vence en <strong>1 hora</strong> y sirve una sola vez. Si no lo pediste tú, ignora este correo: tu contraseña no cambia.",
    color:  d.cuenta.colorPrimario, colorTexto: d.cuenta.colorTextoPrimario,
  })
  await enviar(d.email, "Restablece tu contraseña — Hypnos POS", html, d.link)
}

// ─── Alta, cobro y avisos (registro público, comprobantes, cron) ──────────────

interface CorreoLibre {
  to:        string
  subject:   string
  titulo:    string
  parrafos:  string[]            // HTML ya escapado
  bloque?:   string              // HTML ya escapado (p. ej. datos de transferencia)
  boton?:    { texto: string; link: string }
  pie?:      string
  color?:    string              // color del encabezado
}

function plantillaLibre(o: CorreoLibre) {
  const boton = o.boton
    ? `<p style="text-align:center;margin:0 0 24px;"><a href="${o.boton.link}" style="display:inline-block;background:#f26522;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px;">${o.boton.texto}</a></p>`
    : ""
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:${o.color ?? "#111827"};padding:26px 32px;">
      <span style="color:rgba(255,255,255,0.75);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Hypnos POS</span>
      <h1 style="color:#ffffff;font-size:21px;font-weight:700;margin:8px 0 0;">${o.titulo}</h1>
    </div>
    <div style="padding:28px 32px;">
      ${o.parrafos.map(p => `<p style="color:#374151;font-size:15px;line-height:1.5;margin:0 0 14px;">${p}</p>`).join("\n      ")}
      ${o.bloque ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:8px 0 22px;color:#1f2937;font-size:14px;line-height:1.6;">${o.bloque}</div>` : ""}
      ${boton}
      ${o.pie ? `<p style="color:#6b7280;font-size:13px;margin:0 0 8px;">${o.pie}</p>` : ""}
      ${o.boton ? `<p style="color:#9ca3af;font-size:12px;margin:0;word-break:break-all;">¿El botón no funciona? Copia este enlace: ${o.boton.link}</p>` : ""}
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;">
      <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">Hypnos POS · ¿Dudas? Responde este correo o escribe a contacto@hypnosapps.com · WhatsApp +56 9 3368 8302</p>
    </div>
  </div>
</body>
</html>`
}

/** Envía un correo con la plantilla general de Hypnos POS. Lanza si falla el SMTP. */
export async function enviarCorreoPos(o: CorreoLibre) {
  await enviar(o.to, o.subject, plantillaLibre(o), o.boton?.link ?? "")
}

export const escHtml = esc

/** Texto multilínea → HTML escapado con <br>. */
export function multilinea(txt: string): string {
  return esc(txt).replace(/\r?\n/g, "<br>")
}
