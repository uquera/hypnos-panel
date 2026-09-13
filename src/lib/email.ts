import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function enviarRecuperacionPassword({ nombre, email, link, minutos }: {
  nombre: string; email: string; link: string; minutos: number
}): Promise<void> {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:28px 32px;">
      <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Hypnos Panel</span>
      <h1 style="color:#ffffff;font-size:21px;font-weight:700;margin:8px 0 0;">Restablecer tu contraseña</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 14px;">Hola, <strong>${nombre}</strong>:</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">Recibimos una solicitud para restablecer la contraseña de tu cuenta del panel. Haz clic en el botón para elegir una nueva:</p>
      <p style="text-align:center;margin:0 0 24px;">
        <a href="${link}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:12px;">Elegir nueva contraseña</a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">El enlace vence en <strong>${minutos} minutos</strong> y sirve una sola vez.</p>
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px;">Si no lo pediste tú, ignora este correo: tu contraseña no cambia.</p>
      <p style="color:#9ca3af;font-size:12px;margin:0;word-break:break-all;">¿El botón no funciona? Copia este enlace: ${link}</p>
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;">
      <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">Mensaje automático de Hypnos Panel · No respondas a este correo</p>
    </div>
  </div>
</body>
</html>`

  await transporter.sendMail({
    from:    `"Hypnos Panel" <${process.env.SMTP_USER}>`,
    to:      email,
    subject: "Restablece tu contraseña — Hypnos Panel",
    html,
  })
}

interface AlertaVencimientoParams {
  clienteNombre: string
  clienteEmail: string
  diasRestantes: number
  fechaVencimiento: string
  plan: string
}

export async function enviarAlertaVencimiento({
  clienteNombre,
  clienteEmail,
  diasRestantes,
  fechaVencimiento,
  plan,
}: AlertaVencimientoParams): Promise<void> {
  const urgencia = diasRestantes <= 0
    ? "⛔ SUSPENSIÓN INMINENTE"
    : diasRestantes <= 3
    ? "🔴 Vencimiento crítico"
    : "⚠️ Próximo vencimiento"

  const mensajeDias = diasRestantes <= 0
    ? "Tu suscripción ha vencido hoy."
    : diasRestantes === 1
    ? "Tu suscripción vence <strong>mañana</strong>."
    : `Tu suscripción vence en <strong>${diasRestantes} días</strong>.`

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 32px 24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">🛡️</div>
        <span style="color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Hypnos Panel</span>
      </div>
      <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0;">${urgencia}</h1>
    </div>

    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:15px;margin:0 0 16px;">Hola, equipo de <strong>${clienteNombre}</strong>,</p>
      <p style="color:#374151;font-size:15px;margin:0 0 24px;">${mensajeDias} Para continuar usando el sistema sin interrupciones, realiza el pago de renovación a la brevedad.</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#64748b;font-size:13px;">Plan activo</span>
          <span style="color:#1e293b;font-size:13px;font-weight:600;">${plan}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#64748b;font-size:13px;">Fecha de vencimiento</span>
          <span style="color:#1e293b;font-size:13px;font-weight:600;">${fechaVencimiento}</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#64748b;font-size:13px;">Días restantes</span>
          <span style="color:${diasRestantes <= 3 ? "#dc2626" : "#d97706"};font-size:13px;font-weight:700;">${diasRestantes <= 0 ? "Vencido" : diasRestantes + " día" + (diasRestantes !== 1 ? "s" : "")}</span>
        </div>
      </div>

      <p style="color:#374151;font-size:14px;margin:0 0 8px;">Para renovar, contacta a nuestro equipo:</p>
      <a href="mailto:hypnosapps@gmail.com" style="display:inline-block;color:#6366f1;font-weight:600;font-size:14px;text-decoration:none;">hypnosapps@gmail.com</a>

      <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;">
      <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;">Este es un mensaje automático de Hypnos Panel · No respondas a este correo</p>
    </div>
  </div>
</body>
</html>`

  await transporter.sendMail({
    from:    `"Hypnos Panel" <${process.env.SMTP_USER}>`,
    to:      clienteEmail,
    subject: `${urgencia} — ${clienteNombre}`,
    html,
  })
}
