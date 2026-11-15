import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { ErrorPos } from "./usuarios"
import { precioDe, registrarPagoPos, correoCobroDe } from "./cobro"
import { basePublica } from "./servidor"
import { correoAvisosHypnos, formatoCLP } from "./config"
import { enviarCorreoPos, escHtml as esc } from "./email"

// Cobro automático mensual de Hypnos POS con Suscripciones de Mercado Pago (preapproval),
// en la cuenta de Mercado Pago de Hypnos SpA (MP_ACCESS_TOKEN, credencial de producción de la app).
// Docs: https://www.mercadopago.cl/developers/es/docs/subscriptions/overview
//
// 1. El dueño (o Hypnos) crea la suscripción: preapproval "pending" con el monto del plan y el
//    e-mail del pagador → Mercado Pago entrega un link (init_point) donde el dueño autoriza su
//    tarjeta (crédito, débito Visa/Mastercard o prepago). Nunca vemos la tarjeta.
// 2. Mercado Pago cobra solo cada mes (la primera cuota ~1 hora después de autorizar). Si falla,
//    reintenta hasta 4 veces en 10 días; con 3 cuotas rechazadas cancela la suscripción.
// 3. Cada cuota aprobada se registra como Pago LICENCIA (registrarPagoPos: +1 mes desde el
//    vencimiento, sincroniza la instancia y avisa al dueño). mpPaymentId único: nunca dos veces.
// Fuente de verdad: siempre lo que devuelve la API de Mercado Pago con nuestro token (los avisos
// del webhook solo dicen "algo cambió"). Respaldo sin webhook: sincronizarSuscripciones() en el cron
// diario y al abrir /pos/pago.

const API = () => (process.env.MP_API_BASE_URL || "https://api.mercadopago.com").replace(/\/$/, "")
const INTEGRATOR_ID = () => process.env.MP_INTEGRATOR_ID?.trim() || "dev_3d8150efde2011f193486203702d6ec2"
const token = () => process.env.MP_ACCESS_TOKEN?.trim() || ""

export const mpSuscripcionesListas = () => token() !== ""

async function mp<T>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(API() + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      "X-Integrator-Id": INTEGRATOR_ID(),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let data: unknown = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data: data as T }
}

type Preapproval = {
  id: string; status: string; init_point?: string; payer_email?: string; external_reference?: string
  auto_recurring?: { transaction_amount?: number; currency_id?: string }
  next_payment_date?: string
  message?: string
}
type AuthorizedPayment = {
  id: number | string; preapproval_id: string; status?: string; transaction_amount?: number; currency_id?: string
  payment?: { id?: number | string; status?: string; status_detail?: string } | null
  date_created?: string; debit_date?: string
}

/** "cancelled" y "canceled" son lo mismo (Mercado Pago usa ambas grafías). */
const normEstado = (s: string | undefined) => (s === "canceled" ? "cancelled" : s || "pending")
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Usuario de Hypnos que figura como registrador de los cobros automáticos (el primer ADMIN). */
async function operadorSistema() {
  const u = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } })
  if (!u) throw new ErrorPos("No hay un usuario ADMIN para registrar el cobro automático.", 500)
  return { id: u.id, nombre: "Mercado Pago (cobro automático)" }
}

/** Suscripción vigente de la cuenta (la más reciente que no esté cancelada), o null. */
export async function suscripcionVigente(cuentaId: string) {
  return prisma.posSuscripcion.findFirst({
    where: { cuentaId, estado: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
  })
}

/**
 * Crea la suscripción mensual de la cuenta y devuelve el link para autorizar la tarjeta.
 * Si ya hay una pendiente con el mismo monto y e-mail, reutiliza su link; si hay otra pendiente
 * distinta, la cancela. Una autorizada no se duplica (para cambiar de tarjeta se cancela primero).
 */
export async function crearSuscripcion(p: { cuentaId: string; email: string; creadoPor: string }) {
  if (!mpSuscripcionesListas()) throw new ErrorPos("El pago automático aún no está disponible. Escríbenos a contacto@hypnosapps.com.", 503)
  const email = p.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new ErrorPos("Escribe un correo válido (el de tu cuenta de Mercado Pago).")

  const cuenta = await prisma.posCuenta.findUnique({ where: { id: p.cuentaId }, include: { cliente: true } })
  if (!cuenta || cuenta.eliminadaAt) throw new ErrorPos("Cuenta no encontrada.", 404)
  if (!cuenta.cliente) throw new ErrorPos("Esta cuenta no tiene un plan asociado. Escríbenos a contacto@hypnosapps.com.")
  const monto = precioDe(cuenta)

  const actual = await suscripcionVigente(cuenta.id)
  if (actual?.estado === "authorized" || actual?.estado === "paused") {
    throw new ErrorPos("Ya tienes el pago automático activo. Para cambiar la tarjeta, cancélalo y vuelve a activarlo.")
  }
  if (actual?.estado === "pending") {
    if (actual.monto === monto && actual.payerEmail === email && actual.initPoint) return actual
    await cancelarEnMp(actual.mpId)
    await prisma.posSuscripcion.update({ where: { id: actual.id }, data: { estado: "cancelled" } })
  }

  const r = await mp<Preapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `Hypnos POS · ${cuenta.nombre}`.slice(0, 120),
      external_reference: `pos:${cuenta.id}`,
      payer_email: email,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: monto, currency_id: "CLP" },
      back_url: `${basePublica()}/pos/pago?mp=volver`,
      status: "pending",
    }),
  })
  if (!r.ok || !r.data?.id || !r.data.init_point) {
    console.error("[mp-suscripcion] no se pudo crear", r.status, r.data?.message ?? r.data)
    throw new ErrorPos(r.data?.message ? `Mercado Pago no aceptó la suscripción: ${r.data.message}` : "Mercado Pago no respondió. Intenta de nuevo en unos minutos.", 502)
  }
  const sus = await prisma.posSuscripcion.create({
    data: {
      cuentaId: cuenta.id, mpId: r.data.id, estado: normEstado(r.data.status), monto,
      payerEmail: email, initPoint: r.data.init_point, creadoPor: p.creadoPor,
    },
  })
  console.info("[mp-suscripcion] creada", { cuenta: cuenta.codigo, mpId: sus.mpId, monto })
  return sus
}

async function cancelarEnMp(mpId: string) {
  const r = await mp<Preapproval>(`/preapproval/${encodeURIComponent(mpId)}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) })
  if (!r.ok) console.warn("[mp-suscripcion] no se pudo cancelar en Mercado Pago", mpId, r.status)
  return r.ok
}

/** Cancela el pago automático vigente de la cuenta (el dueño desde el portal o Hypnos). */
export async function cancelarSuscripcion(cuentaId: string, por: string) {
  const sus = await suscripcionVigente(cuentaId)
  if (!sus) throw new ErrorPos("No hay un pago automático activo.")
  if (!(await cancelarEnMp(sus.mpId))) throw new ErrorPos("Mercado Pago no respondió. Intenta de nuevo en unos minutos.", 502)
  await prisma.posSuscripcion.update({ where: { id: sus.id }, data: { estado: "cancelled" } })
  const cuenta = await prisma.posCuenta.findUnique({ where: { id: cuentaId }, select: { nombre: true, clienteId: true } })
  const op = await operadorSistema().catch(() => null)
  if (op) await logActividad({ usuarioId: op.id, usuarioNombre: por, clienteId: cuenta?.clienteId ?? undefined, clienteNombre: cuenta?.nombre, accion: "POS_SUSCRIPCION", detalle: `[Hypnos POS] Pago automático cancelado por ${por}` })
  return true
}

/** Relee el preapproval en Mercado Pago y guarda su estado. Avisa a Hypnos cuando queda autorizado. */
export async function actualizarSuscripcion(mpId: string) {
  const sus = await prisma.posSuscripcion.findUnique({ where: { mpId }, include: { cuenta: true } })
  if (!sus) return null
  const r = await mp<Preapproval>(`/preapproval/${encodeURIComponent(mpId)}`)
  if (!r.ok || !r.data?.id) return sus
  const estado = normEstado(r.data.status)
  if (estado === sus.estado) return sus
  const act = await prisma.posSuscripcion.update({ where: { id: sus.id }, data: { estado } })
  console.info("[mp-suscripcion] estado", { cuenta: sus.cuenta.codigo, de: sus.estado, a: estado })
  if (estado === "authorized" || estado === "cancelled") {
    await enviarCorreoPos({
      to: correoAvisosHypnos(),
      subject: estado === "authorized" ? `Pago automático activado: ${sus.cuenta.nombre}` : `Pago automático cancelado: ${sus.cuenta.nombre}`,
      titulo: estado === "authorized" ? "Nuevo pago automático con Mercado Pago" : "Se canceló un pago automático",
      parrafos: [
        `<strong>${esc(sus.cuenta.nombre)}</strong> ${estado === "authorized" ? "autorizó su tarjeta" : "ya no tiene pago automático"} (${esc(formatoCLP(sus.monto))} al mes, ${esc(sus.payerEmail)}).`,
        estado === "authorized" ? "Cada cobro mensual se registrará solo como pago de licencia." : "Mercado Pago lo cancela tras 3 cuotas rechazadas, o lo canceló el dueño. Revisa el cobro de este mes.",
      ],
      boton: { texto: "Ver ficha en el panel", link: `${basePublica()}/admin/pos/${sus.cuentaId}` },
    }).catch(e => console.error("[mp-suscripcion] aviso Hypnos:", e))
  }
  return act
}

/**
 * Procesa una cuota (pago autorizado) de Mercado Pago. Aprobada → Pago LICENCIA (+1 mes) una sola vez.
 * Rechazada → se anota y se avisa al dueño (Mercado Pago reintenta solo).
 */
export async function procesarCuota(ap: AuthorizedPayment): Promise<"registrado" | "repetido" | "rechazado" | "pendiente" | "ajeno"> {
  const sus = await prisma.posSuscripcion.findUnique({ where: { mpId: String(ap.preapproval_id ?? "") }, include: { cuenta: { include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } } } } })
  if (!sus) return "ajeno"
  const payId = ap.payment?.id != null ? String(ap.payment.id) : ""
  const payStatus = ap.payment?.status ?? ""
  if (!payId || !payStatus || payStatus === "pending" || payStatus === "in_process") return "pendiente"
  if (await prisma.posSuscripcionCobro.findUnique({ where: { mpPaymentId: payId } })) return "repetido"
  const monto = Number(ap.transaction_amount) || sus.monto

  if (payStatus !== "approved") {
    await prisma.posSuscripcionCobro.create({ data: { suscripcionId: sus.id, mpPaymentId: payId, monto, estado: payStatus } }).catch(() => null)
    const to = correoCobroDe(sus.cuenta)
    if (to) {
      await enviarCorreoPos({
        to,
        subject: `No pudimos cobrar tu mensualidad de Hypnos POS`,
        titulo: "Tu tarjeta rechazó el cobro de este mes",
        parrafos: [
          `Mercado Pago intentó cobrar <strong>${esc(formatoCLP(monto))}</strong> de la mensualidad de <strong>${esc(sus.cuenta.nombre)}</strong> y la tarjeta lo rechazó.`,
          "Mercado Pago volverá a intentarlo en los próximos días. Revisa que tu tarjeta tenga cupo, o paga este mes desde tu portal para no quedar suspendido.",
        ],
        boton: { texto: "Ir a mi portal de pago", link: `${basePublica()}/pos/pago` },
      }).catch(e => console.error("[mp-suscripcion] aviso rechazo:", e))
    }
    console.warn("[mp-suscripcion] cuota rechazada", { cuenta: sus.cuenta.codigo, pago: payId, detalle: ap.payment?.status_detail })
    return "rechazado"
  }

  // Reserva el cobro antes de registrar el pago: si llegan el webhook y el cron a la vez, solo uno pasa
  try {
    await prisma.posSuscripcionCobro.create({ data: { suscripcionId: sus.id, mpPaymentId: payId, monto, estado: "approved" } })
  } catch {
    return "repetido"
  }
  const r = await registrarPagoPos({
    cuentaId: sus.cuentaId, monto, meses: 1,
    notas: `Hypnos POS · cobro automático Mercado Pago · pago ${payId}`,
    operador: await operadorSistema(),
  })
  await prisma.$transaction([
    prisma.posSuscripcionCobro.update({ where: { mpPaymentId: payId }, data: { pagoId: r.pago.id } }),
    prisma.posSuscripcion.update({ where: { id: sus.id }, data: { ultimoCobroAt: new Date(), ...(sus.estado === "pending" ? { estado: "authorized" } : {}) } }),
  ])
  console.info("[mp-suscripcion] cuota registrada", { cuenta: sus.cuenta.codigo, pago: payId, monto, hasta: r.hasta.toISOString() })
  return "registrado"
}

/** Cuotas de una suscripción (para sincronizar sin depender del webhook). */
async function cuotasDe(mpId: string): Promise<AuthorizedPayment[]> {
  const r = await mp<{ results?: AuthorizedPayment[] }>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(mpId)}&limit=50`)
  return r.ok && Array.isArray(r.data?.results) ? r.data.results : []
}

/** Revisa estado y cuotas de una suscripción. */
export async function sincronizarSuscripcion(mpId: string) {
  const sus = await actualizarSuscripcion(mpId)
  if (!sus) return { registradas: 0 }
  let registradas = 0
  for (const ap of await cuotasDe(mpId)) {
    if ((await procesarCuota({ ...ap, preapproval_id: ap.preapproval_id ?? mpId })) === "registrado") registradas++
  }
  return { registradas }
}

/** Revisa todas las suscripciones vivas (cron diario). Nunca lanza. */
export async function sincronizarSuscripciones() {
  const res = { revisadas: 0, registradas: 0, errores: 0 }
  if (!mpSuscripcionesListas()) return res
  const vivas = await prisma.posSuscripcion.findMany({ where: { estado: { in: ["pending", "authorized", "paused"] } }, select: { mpId: true } })
  for (const s of vivas) {
    res.revisadas++
    try {
      res.registradas += (await sincronizarSuscripcion(s.mpId)).registradas
    } catch (e) {
      res.errores++
      console.error("[mp-suscripcion] sincronizar", s.mpId, e)
    }
  }
  return res
}

/**
 * Aviso del webhook de Mercado Pago (temas de suscripciones). Devuelve lo que hizo, para el log.
 * - subscription_preapproval: cambió una suscripción → se relee.
 * - subscription_authorized_payment: hay una cuota → se consulta y se procesa.
 */
export async function procesarAvisoSuscripcion(tipo: string, id: string): Promise<string> {
  if (!mpSuscripcionesListas() || !id) return "sin-config"
  if (tipo === "subscription_preapproval" || tipo === "preapproval") {
    const s = await actualizarSuscripcion(id)
    return s ? `preapproval:${s.estado}` : "preapproval:ajeno"
  }
  if (tipo === "subscription_authorized_payment" || tipo === "authorized_payment") {
    const r = await mp<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`)
    if (!r.ok || !r.data?.preapproval_id) return "cuota:no-encontrada"
    return `cuota:${await procesarCuota(r.data)}`
  }
  return "ignorado"
}
