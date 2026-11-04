import { opcionesPago } from "./links-pago"
import { enviarCorreoPos, escHtml as esc, multilinea } from "./email"
import { correoAvisosHypnos, datosTransferencia, formatoCLP, whatsappDigitos, CORREO_CONTACTO } from "./config"
import { fechaLarga } from "./fechas"
import type { ResultadoAlta } from "./onboarding"

// Correos de negocio de Hypnos POS: bienvenida, cobro, comprobantes y avisos a Hypnos.
// Todos salen desde "Hypnos POS" <no-reply@hypnosapps.com> con Reply-To contacto@ (email.ts).

/** Monto, botón "Pagar con tarjeta" (link TUU de ese monto, si hay) y datos de transferencia. */
async function bloqueTransferencia(monto: number): Promise<string> {
  const datos = datosTransferencia()
  const cuerpo = datos
    ? multilinea(datos)
    : `Solicita los datos de transferencia a <a href="mailto:${CORREO_CONTACTO}">${CORREO_CONTACTO}</a>.`
  const opciones = await opcionesPago(monto)
  const mes = opciones.find(o => o.meses === 1)
  const largos = opciones.filter(o => o.meses > 1)
    .map(o => `<a href="${esc(o.url)}" style="color:#4f46e5;font-weight:600;">o paga ${o.meses === 12 ? "el año" : `${o.meses} meses`} por ${esc(formatoCLP(o.monto))}${o.monto < monto * o.meses ? ` (ahorras ${esc(formatoCLP(monto * o.meses - o.monto))})` : ""}</a>`)
  const tarjeta = mes
    ? `<a href="${esc(mes.url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:10px;">Pagar con tarjeta o Webpay</a>`
      + (largos.length ? `<br>${largos.join("<br>")}` : "")
      + `<br><span style="color:#6b7280;font-size:12px;">Escribe el nombre de tu local en el formulario y luego sube el comprobante en tu portal.</span><br><br><strong>O transfiere a:</strong><br>`
    : ""
  return `<strong>Monto: ${esc(formatoCLP(monto))}</strong><br><br>${tarjeta}${cuerpo}`
}

/** Al terminar la instalación: el sistema está listo. */
export async function correoBienvenida(d: {
  to: string; dueno: string; restaurante: string; url: string; enPrueba: boolean; vence: Date; linkPago: string; monto: number
  mesas?: number; menuUrl?: string; resultado?: ResultadoAlta
}) {
  // Lo que quedó listo según el resultado de la instalación
  const listo: string[] = []
  const menu = d.resultado?.menu
  if (menu?.ok && (menu.productos ?? 0) > 0) listo.push(`Importamos <strong>${menu.productos} productos</strong> de tu menú online.`)
  else if (d.menuUrl) listo.push(`No pudimos importar tu menú automáticamente: cargamos una carta de ejemplo y te ayudamos a pasarlo por WhatsApp (+56 9 3368 8302).`)
  else listo.push(`Cargamos una carta de ejemplo para que pruebes; reemplázala por tus productos cuando quieras.`)
  const cli = d.resultado?.clientes
  if (cli?.ok && (cli.importados ?? 0) > 0) listo.push(`Importamos <strong>${cli.importados} clientes</strong> desde tu archivo.`)
  else if (cli && !cli.ok) listo.push(`No pudimos importar tu archivo de clientes; lo revisamos contigo.`)
  if (d.mesas) listo.push(`Dejamos creadas <strong>${d.mesas} mesas</strong>.`)

  const pasos = [
    `<strong>Crea tu contraseña</strong> con el enlace que te llega en otro correo: es una sola, para tu sistema y tu portal (si no lo ves, revisa spam o usa «¿Olvidaste tu contraseña?» con este correo).`,
    `<strong>Conecta tu impresora</strong> de comandas y boletas desde Configuración.`,
    `<strong>Comparte tu tienda</strong> online con tus clientes para recibir pedidos.`,
  ]

  await enviarCorreoPos({
    to: d.to,
    subject: `Tu sistema ${d.restaurante} está listo — Hypnos POS`,
    titulo: "¡Tu sistema está listo!",
    parrafos: [
      `Hola, <strong>${esc(d.dueno)}</strong>:`,
      `El sistema de <strong>${esc(d.restaurante)}</strong> ya está funcionando en <a href="${d.url}">${esc(d.url.replace(/^https?:\/\//, ""))}</a>.`,
      d.enPrueba
        ? `Tu prueba gratis dura hasta el <strong>${esc(fechaLarga(d.vence))}</strong>. Después el plan cuesta ${esc(formatoCLP(d.monto))} al mes, por transferencia. Te avisaremos antes de que termine.`
        : `Tu plan está activo hasta el <strong>${esc(fechaLarga(d.vence))}</strong>.`,
      `<strong>Próximos pasos:</strong><br>${pasos.map((p, i) => `${i + 1}. ${p}`).join("<br>")}`,
      `Tu portal de Hypnos POS (<a href="${d.linkPago.replace(/\/pago$/, "")}">panel.hypnosapps.com/pos</a>) es donde abres tu sistema, pagas tu plan y ves tu prueba gratis.`,
    ],
    bloque: `<strong>Lo que ya quedó listo</strong><br>${listo.map(l => `✓ ${l}`).join("<br>")}`,
    boton: { texto: "Abrir mi sistema", link: d.url },
    pie: `Pagos y comprobantes: <a href="${d.linkPago}">${esc(d.linkPago)}</a>`,
    color: "#f26522",
  })
}

/** Aviso de prueba que termina (3 o 1 día). */
export async function correoPruebaTermina(d: { to: string; restaurante: string; dias: number; vence: Date; linkPago: string; monto: number }) {
  const cuando = d.dias <= 1 ? "mañana" : `en ${d.dias} días`
  await enviarCorreoPos({
    to: d.to,
    subject: `Tu prueba de Hypnos POS termina ${cuando}`,
    titulo: `Tu prueba termina ${cuando}`,
    parrafos: [
      `Hola, equipo de <strong>${esc(d.restaurante)}</strong>:`,
      `Tu prueba gratis de Hypnos POS termina el <strong>${esc(fechaLarga(d.vence))}</strong>. Para seguir usando el sistema sin interrupciones, transfiere la mensualidad y sube el comprobante en tu portal:`,
    ],
    bloque: await bloqueTransferencia(d.monto),
    boton: { texto: "Subir comprobante", link: d.linkPago },
    color: "#f26522",
  })
}

/** Cobro (5 días antes) o recordatorio (día del vencimiento). */
export async function correoCobro(d: { to: string; restaurante: string; dias: number; vence: Date; linkPago: string; enPrueba: boolean; monto: number }) {
  const hoy = d.dias <= 0
  const que = d.enPrueba ? "prueba" : "plan"
  // el aviso puede salir después del vencimiento (cron atrasado): entonces dice "venció"
  const vencioYa = d.dias < 0
  await enviarCorreoPos({
    to: d.to,
    subject: vencioYa
      ? `Tu ${que} de Hypnos POS venció el ${fechaLarga(d.vence)}`
      : hoy ? `Hoy vence tu ${que} de Hypnos POS` : `Tu plan de Hypnos POS vence el ${fechaLarga(d.vence)}`,
    titulo: vencioYa ? `Tu ${que} venció` : hoy ? `Hoy vence tu ${que}` : "Se acerca tu próximo pago",
    parrafos: [
      `Hola, equipo de <strong>${esc(d.restaurante)}</strong>:`,
      hoy
        ? `Tu ${d.enPrueba ? "prueba gratis" : "plan"} de Hypnos POS ${vencioYa ? `venció el <strong>${esc(fechaLarga(d.vence))}</strong>` : "vence <strong>hoy</strong>"}. Si ya pagaste, sube el comprobante para que lo confirmemos. Si no recibimos el pago, el sistema se suspenderá en unos días.`
        : `Tu plan de Hypnos POS vence el <strong>${esc(fechaLarga(d.vence))}</strong> (en ${d.dias} días). Puedes pagar por transferencia y subir el comprobante en tu portal:`,
    ],
    bloque: await bloqueTransferencia(d.monto),
    boton: { texto: "Subir comprobante", link: d.linkPago },
  })
}

export async function correoSuspension(d: { to: string; restaurante: string; linkPago: string; monto: number }) {
  await enviarCorreoPos({
    to: d.to,
    subject: `Tu sistema ${d.restaurante} fue suspendido — Hypnos POS`,
    titulo: "Tu sistema fue suspendido",
    parrafos: [
      `Hola, equipo de <strong>${esc(d.restaurante)}</strong>:`,
      `No recibimos el pago de tu plan de Hypnos POS, así que el sistema quedó <strong>suspendido</strong>. Tus datos están guardados: apenas confirmemos la transferencia, se reactiva.`,
    ],
    bloque: await bloqueTransferencia(d.monto),
    boton: { texto: "Subir comprobante", link: d.linkPago },
    color: "#b91c1c",
  })
}

export async function correoPagoAprobado(d: { to: string; restaurante: string; monto: number; hasta: Date; url: string }) {
  await enviarCorreoPos({
    to: d.to,
    subject: `Pago recibido — ${d.restaurante} activo hasta el ${fechaLarga(d.hasta)}`,
    titulo: "¡Pago recibido!",
    parrafos: [
      `Hola, equipo de <strong>${esc(d.restaurante)}</strong>:`,
      `Confirmamos tu pago de <strong>${esc(formatoCLP(d.monto))}</strong>. Tu sistema está activo hasta el <strong>${esc(fechaLarga(d.hasta))}</strong>. ¡Gracias!`,
    ],
    boton: d.url ? { texto: "Abrir mi sistema", link: d.url } : undefined,
    color: "#15803d",
  })
}

export async function correoComprobanteRechazado(d: { to: string; restaurante: string; motivo: string; linkPago: string }) {
  await enviarCorreoPos({
    to: d.to,
    subject: `Revisamos tu comprobante — ${d.restaurante}`,
    titulo: "No pudimos aprobar tu comprobante",
    parrafos: [
      `Hola, equipo de <strong>${esc(d.restaurante)}</strong>:`,
      `Revisamos el comprobante que subiste y no pudimos aprobarlo. Motivo:`,
      `<em>${multilinea(d.motivo)}</em>`,
      `Puedes subir uno nuevo en tu portal o respondernos este correo.`,
    ],
    boton: { texto: "Subir otro comprobante", link: d.linkPago },
  })
}

// ─── Avisos internos a Hypnos (contacto@) ─────────────────────────────────────

export async function avisoHypnosRegistro(d: {
  restaurante: string; dueno: string; email: string; whatsapp: string; codigo: string; linkFicha: string
}) {
  const wa = whatsappDigitos(d.whatsapp)
  await enviarCorreoPos({
    to: correoAvisosHypnos(),
    subject: `Nuevo registro Hypnos POS: ${d.restaurante}`,
    titulo: "Nuevo restaurante en prueba",
    parrafos: [
      `<strong>${esc(d.restaurante)}</strong> se registró en Hypnos POS (prueba gratis).`,
      `Dueño: ${esc(d.dueno)}<br>Correo: <a href="mailto:${esc(d.email)}">${esc(d.email)}</a><br>WhatsApp: ${wa ? `<a href="https://wa.me/${wa}">+${wa}</a>` : esc(d.whatsapp)}<br>Subdominio: ${esc(d.codigo)}.hypnosapps.com`,
    ],
    boton: { texto: "Ver ficha en el panel", link: d.linkFicha },
  })
}

export async function avisoHypnosComprobante(d: { restaurante: string; monto: number; subidoPor: string; linkFicha: string }) {
  await enviarCorreoPos({
    to: correoAvisosHypnos(),
    subject: `Nuevo comprobante de ${d.restaurante}`,
    titulo: "Comprobante por revisar",
    parrafos: [
      `<strong>${esc(d.restaurante)}</strong> subió un comprobante por <strong>${esc(formatoCLP(d.monto))}</strong> (${esc(d.subidoPor)}).`,
      `Revísalo y apruébalo o recházalo en el panel.`,
    ],
    boton: { texto: "Revisar comprobante", link: d.linkFicha },
  })
}

export async function avisoHypnosErrorAlta(d: { restaurante: string; codigo: string; error: string; linkFicha: string }) {
  await enviarCorreoPos({
    to: correoAvisosHypnos(),
    subject: `Error instalando ${d.codigo}.hypnosapps.com`,
    titulo: "Falló la instalación de un restaurante",
    parrafos: [
      `La instalación de <strong>${esc(d.restaurante)}</strong> (${esc(d.codigo)}) terminó con error:`,
      `<code>${esc(d.error.slice(0, 500))}</code>`,
      `Revisa el log en la ficha y usa «Reintentar instalación».`,
    ],
    boton: { texto: "Ver ficha", link: d.linkFicha },
    color: "#b91c1c",
  })
}
