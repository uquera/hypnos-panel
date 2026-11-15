import { prisma } from "@/lib/prisma"
import { ErrorPos } from "./usuarios"
import { EMAIL_RE } from "./validacion"
import { correoAvisosHypnos, formatoCLP, whatsappDigitos } from "./config"
import { basePublica } from "./servidor"
import { enviarCorreoPos, escHtml as esc } from "./email"
import { normalizarOrigen } from "./contratar"
import { formatoRut, normalizarRut } from "./contratar-calculo"

// Solicitudes públicas que Hypnos gestiona a mano desde /admin/pos/contratar:
//   - PosSolicitudMaquina (/pos/maquina): el comercio pide una Point Smart 2 (la vende Hypnos) o una TUU
//     (Hypnos gestiona la solicitud con TUU). Solo se comparten sus datos con la marca si lo autorizó.
//   - PosPartnerLead (/pos/contadores): contadores u otros que quieren recomendar Hypnos POS.
// Cada una avisa por correo a Hypnos (POS_AVISOS_EMAIL, default contacto@) con enviarCorreoPos.

export const MARCAS_MAQUINA = { MERCADOPAGO: "Mercado Pago Point Smart 2", TUU: "TUU" } as const
export type MarcaMaquina = keyof typeof MARCAS_MAQUINA
export const ESTADOS_SOLICITUD = ["PENDIENTE", "CONTACTADO", "CERRADO"] as const
export const CLIENTES_PARTNER = ["1 a 10", "11 a 30", "31 a 100", "Más de 100"] as const

type Entrada = Record<string, unknown>
const txt = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max)

function contacto(b: Entrada) {
  const nombre = txt(b.nombre, 80)
  const telefono = txt(b.telefono, 30)
  const email = txt(b.email, 180).toLowerCase()
  if (nombre.length < 2) throw new ErrorPos("Escribe tu nombre.")
  if (telefono.replace(/\D/g, "").length < 8) throw new ErrorPos("Escribe un teléfono válido.")
  if (!EMAIL_RE.test(email)) throw new ErrorPos("Escribe un correo válido.")
  return { nombre, telefono, email }
}

function lineaContacto(d: { nombre: string; telefono: string; email: string }) {
  const wa = whatsappDigitos(d.telefono)
  return `${esc(d.nombre)} · ${esc(d.email)} · ${wa ? `<a href="https://wa.me/${wa}">+${wa}</a>` : esc(d.telefono)}`
}

async function avisar(subject: string, parrafos: string[], seccion: string) {
  await enviarCorreoPos({
    to: correoAvisosHypnos(), subject, titulo: subject, parrafos,
    boton: { texto: "Ver en el panel", link: `${basePublica()}/admin/pos/contratar#${seccion}` },
  })
}

// ─── Consigue tu máquina ──────────────────────────────────────────────────────

export async function crearSolicitudMaquina(b: Entrada, ip: string, precioPoint: number) {
  const marca = b.marca === "TUU" ? "TUU" : b.marca === "MERCADOPAGO" ? "MERCADOPAGO" : null
  if (!marca) throw new ErrorPos("Elige la máquina que quieres.")
  const rut = normalizarRut(txt(b.rut, 20))
  if (!rut) throw new ErrorPos("Revisa el RUT de la empresa: el dígito verificador no calza.")
  const razonSocial = txt(b.razonSocial, 120)
  if (razonSocial.length < 2) throw new ErrorPos("Escribe la razón social (o tu nombre si eres persona natural).")
  const { nombre, telefono, email } = contacto(b)
  const comuna = txt(b.comuna, 60)
  if (comuna.length < 2) throw new ErrorPos("Escribe la comuna.")
  if (b.autoriza !== true) throw new ErrorPos(`Para gestionar tu máquina debemos compartir tus datos con ${marca === "TUU" ? "TUU" : "Mercado Pago"}. Marca la casilla de autorización.`)

  // si ya es cliente de Hypnos POS (mismo RUT), queda vinculado a su local
  const cuenta = await prisma.posCuenta.findFirst({ where: { rut, eliminadaAt: null }, select: { id: true, nombre: true } })
  const s = await prisma.posSolicitudMaquina.create({
    data: { cuentaId: cuenta?.id ?? null, marca, rut, razonSocial, nombre, telefono, email, comuna, autoriza: true, origen: normalizarOrigen(b.origen), ip },
  })

  void avisar(`🧾 Solicitud de máquina ${marca === "TUU" ? "TUU" : "Point Smart 2"}: ${razonSocial}`, [
    `<strong>${esc(MARCAS_MAQUINA[marca])}</strong>${marca === "MERCADOPAGO" ? ` · la vende Hypnos (${esc(formatoCLP(precioPoint))} IVA incluido)` : " · gestionar la solicitud con TUU"}`,
    `RUT ${esc(formatoRut(rut))} · ${esc(razonSocial)} · ${esc(comuna)}${cuenta ? `<br>Ya es cliente de Hypnos POS: ${esc(cuenta.nombre)}` : ""}`,
    lineaContacto({ nombre, telefono, email }),
    `Autorizó compartir sus datos con ${marca === "TUU" ? "TUU" : "Mercado Pago"}.${s.origen ? ` Vino desde: ${esc(s.origen)}.` : ""}`,
  ], "maquinas").catch(e => console.error("[pos-maquina] aviso a Hypnos:", e))
  return s.id
}

// ─── Programa para contadores ─────────────────────────────────────────────────

export async function crearPartnerLead(b: Entrada, ip: string) {
  const { nombre, telefono, email } = contacto(b)
  const tipo = b.tipo === "OTRO" ? "OTRO" : "CONTADOR"
  const oficina = txt(b.oficina, 120)
  if (tipo === "CONTADOR" && oficina.length < 2) throw new ErrorPos("Escribe el nombre de tu oficina contable (o tu nombre si trabajas solo).")
  const rutTxt = txt(b.rut, 20)
  const rut = rutTxt ? normalizarRut(rutTxt) : ""
  if (rut === null) throw new ErrorPos("Revisa el RUT: el dígito verificador no calza (o déjalo en blanco).")
  const clientes = (CLIENTES_PARTNER as readonly string[]).includes(String(b.clientes)) ? String(b.clientes) : ""
  if (!clientes) throw new ErrorPos("Indica cuántos clientes pyme atiendes, aproximadamente.")

  const l = await prisma.posPartnerLead.create({
    data: { tipo, nombre, oficina, rut, telefono, email, clientes, origen: normalizarOrigen(b.origen), ip },
  })
  void avisar(`🤝 Interesado en el programa de partners (${tipo === "CONTADOR" ? "contador" : "otro"}): ${oficina || nombre}`, [
    `<strong>${esc(oficina || nombre)}</strong>${rut ? ` · RUT ${esc(formatoRut(rut))}` : ""} · ${tipo === "CONTADOR" ? "contador" : "otro"}`,
    `Clientes pyme aproximados: <strong>${esc(clientes)}</strong>`,
    lineaContacto({ nombre, telefono, email }),
    `Quiere conocer las condiciones para partners: agendar una llamada.${l.origen ? ` Vino desde: ${esc(l.origen)}.` : ""}`,
  ], "partners").catch(e => console.error("[pos-partner] aviso a Hypnos:", e))
  return l.id
}
