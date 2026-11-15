import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { OWNER_EMAIL } from "@/lib/auth"
import { logActividad } from "@/lib/actividad"
import { ErrorPos } from "./usuarios"
import { registrarPagoPos } from "./cobro"
import { correoAvisosHypnos, formatoCLP, precioMensual, whatsappDigitos } from "./config"
import { basePortal, basePublica } from "./servidor"
import { enviarCorreoPos, escHtml as esc } from "./email"
import {
  CATALOGO_DEFECTO, calcularPedido, formatoRut,
  type Catalogo, type Cupon, type Linea, type Pedido, type Seleccion,
} from "./contratar-calculo"

// Contratación online de Hypnos POS (/pos/contratar): catálogo de precios, cupones, pedido y su pago
// con Mercado Pago Checkout Pro en la cuenta de Hypnos SpA (MP_ACCESS_TOKEN, la misma del pago automático).
//
// Flujo: el registro crea la cuenta en prueba y lanza la instalación de inmediato (como /pos/registro).
// Si hay algo que pagar hoy, se crea un PosPedido y una preferencia de Checkout Pro con
// external_reference "pedido:<id>". El pago se confirma SOLO releyéndolo en la API de Mercado Pago
// (aviso del webhook /api/mp/webhook o sincronización al volver a la página); entonces:
//   - el plan se registra como Pago LICENCIA (registrarPagoPos: 1 o 12 meses, quita la prueba);
//   - puesta en marcha y máquinas se registran como Pago DESARROLLO (ingreso, no cuenta para la gobernanza);
//   - Hypnos recibe un correo con lo que debe hacer (agendar la puesta en marcha, despachar la Point).
// Un pago se aplica una sola vez: escritura condicional PENDIENTE → PAGADO y mpPaymentId único.

const CLAVE_CATALOGO = "contratar"
const API = () => (process.env.MP_API_BASE_URL || "https://api.mercadopago.com").replace(/\/$/, "")
const INTEGRATOR_ID = () => process.env.MP_INTEGRATOR_ID?.trim() || "dev_3d8150efde2011f193486203702d6ec2"
const token = () => process.env.MP_ACCESS_TOKEN?.trim() || ""
export const mpCheckoutListo = () => token() !== ""

// ─── Catálogo (editable en /admin/pos/contratar, guardado en pos_config) ──────

export async function getCatalogo(): Promise<Catalogo> {
  const def = CATALOGO_DEFECTO(precioMensual())
  const row = await prisma.posConfig.findUnique({ where: { clave: CLAVE_CATALOGO } }).catch(() => null)
  if (!row) return def
  try {
    const v = JSON.parse(row.valor) as Partial<Catalogo>
    const n = (x: unknown, d: number, min = 0) => { const k = Math.round(Number(x)); return Number.isFinite(k) && k >= min ? k : d }
    return {
      mensualCaja: n(v.mensualCaja, def.mensualCaja, 1),
      anualCaja: n(v.anualCaja, def.anualCaja, 1),
      marcha: n(v.marcha, def.marcha),
      point: n(v.point, def.point, 1),
      cuotas: Math.min(n(v.cuotas, def.cuotas, 1), 12),
      cuotasSinInteres: typeof v.cuotasSinInteres === "boolean" ? v.cuotasSinInteres : def.cuotasSinInteres,
      pointActiva: typeof v.pointActiva === "boolean" ? v.pointActiva : def.pointActiva,
      maxCajas: Math.min(n(v.maxCajas, def.maxCajas, 1), 50),
    }
  } catch {
    return def
  }
}

export async function guardarCatalogo(c: Catalogo) {
  await prisma.posConfig.upsert({
    where: { clave: CLAVE_CATALOGO },
    create: { clave: CLAVE_CATALOGO, valor: JSON.stringify(c) },
    update: { valor: JSON.stringify(c) },
  })
}

// ─── Cupones ──────────────────────────────────────────────────────────────────

export const normalizarCupon = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30)

/** Cupón vigente con ese código o un ErrorPos con el motivo. */
export async function buscarCupon(codigo: string): Promise<Cupon & { id: string }> {
  const c = normalizarCupon(codigo)
  if (!c) throw new ErrorPos("Escribe el código del cupón.")
  const cup = await prisma.posCupon.findUnique({ where: { codigo: c } })
  if (!cup || !cup.activo) throw new ErrorPos("Ese cupón no existe.", 404)
  if (cup.venceAt && cup.venceAt < new Date()) throw new ErrorPos("Ese cupón ya venció.")
  if (cup.usosMax != null && cup.usos >= cup.usosMax) throw new ErrorPos("Ese cupón ya se usó todas las veces permitidas.")
  return { id: cup.id, codigo: cup.codigo, tipo: cup.tipo === "MONTO" ? "MONTO" : "PORCENTAJE", valor: cup.valor, soloAnual: cup.soloAnual }
}

export function describirCupon(c: Cupon): string {
  const d = c.tipo === "PORCENTAJE" ? `${c.valor}% de descuento en el plan` : `${formatoCLP(c.valor)} de descuento en el plan`
  return c.soloAnual ? `${d} anual` : d
}

/** Suma un uso respetando el máximo (condicional: dos pedidos a la vez no superan el límite). */
async function usarCupon(id: string): Promise<boolean> {
  const cup = await prisma.posCupon.findUnique({ where: { id }, select: { usosMax: true } })
  if (!cup) return false
  const r = await prisma.posCupon.updateMany({
    where: { id, activo: true, ...(cup.usosMax != null ? { usos: { lt: cup.usosMax } } : {}) },
    data: { usos: { increment: 1 } },
  })
  return r.count > 0
}

// ─── Token del pedido (la página "listo" lo usa para consultar el estado) ─────

function secreto(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "hypnos-dev"
}
export function tokenPedido(pedidoId: string): string {
  return crypto.createHmac("sha256", secreto()).update(`pos-pedido.${pedidoId}`).digest("base64url").slice(0, 32)
}
export function tokenPedidoValido(pedidoId: string, t: string): boolean {
  const a = Buffer.from(tokenPedido(pedidoId)), b = Buffer.from(String(t))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ─── Mercado Pago ─────────────────────────────────────────────────────────────

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

type MpPago = {
  id: number | string; status?: string; status_detail?: string; external_reference?: string | null
  transaction_amount?: number; currency_id?: string; date_approved?: string | null; installments?: number
}

/** Crea la preferencia de Checkout Pro del pedido y guarda su link. */
async function crearPreferencia(pedidoId: string, p: {
  lineas: Linea[]; descuento: number; total: number; email: string; nombre: string; local: string; cuotas: number
}) {
  if (!mpCheckoutListo()) throw new ErrorPos("El pago con Mercado Pago aún no está disponible. Elige transferencia.", 503)
  const portal = basePortal()
  const listo = `${portal}/pos/contratar/listo?p=${encodeURIComponent(pedidoId)}&t=${tokenPedido(pedidoId)}`
  // Un solo ítem con el total (el descuento ya aplicado): Mercado Pago no admite ítems negativos.
  const detalle = p.lineas.filter(l => l.monto > 0).map(l => l.nombre).join(" + ")
  const r = await mp<{ id?: string; init_point?: string; message?: string }>("/checkout/preferences", {
    method: "POST",
    body: JSON.stringify({
      items: [{
        id: "hypnos-pos", title: `Hypnos POS · ${p.local}`.slice(0, 250),
        description: `${detalle}${p.descuento ? ` (con descuento de ${formatoCLP(p.descuento)})` : ""}`.slice(0, 250),
        category_id: "services", quantity: 1, currency_id: "CLP", unit_price: p.total,
      }],
      payer: { email: p.email, name: p.nombre },
      external_reference: `pedido:${pedidoId}`,
      statement_descriptor: "HYPNOS POS",
      notification_url: `${basePublica()}/api/mp/webhook?source_news=webhooks`,
      back_urls: { success: listo, pending: listo, failure: `${listo}&fallo=1` },
      auto_return: "approved",
      payment_methods: { installments: Math.max(1, p.cuotas), excluded_payment_types: [{ id: "ticket" }] },
      expires: true,
      expiration_date_to: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    }),
  })
  if (!r.ok || !r.data?.id || !r.data.init_point) {
    console.error("[contratar] preferencia", r.status, r.data?.message ?? r.data)
    throw new ErrorPos("Mercado Pago no respondió. Intenta de nuevo o elige transferencia.", 502)
  }
  await prisma.posPedido.update({ where: { id: pedidoId }, data: { mpPreferenceId: r.data.id, initPoint: r.data.init_point } })
  return r.data.init_point
}

// ─── Crear el pedido (lo llama POST /api/pos-registro/contratar tras crear la cuenta) ──

export interface DatosFacturacion { rut: string; razonSocial: string; comuna: string; direccionEnvio: string }

export async function crearPedido(p: {
  cuentaId: string; seleccion: Seleccion; cuponId?: string | null; medio: "MERCADOPAGO" | "TRANSFERENCIA"
  facturacion: DatosFacturacion; email: string; dueno: string; local: string
}): Promise<{ pedidoId: string; pedido: Pedido; pagarUrl: string | null; errorPago: string | null }> {
  const cat = await getCatalogo()
  // el cupón solo se marca como usado si de verdad descuenta algo
  let sel = p.seleccion
  let pedido = calcularPedido(cat, sel)
  if (p.cuponId && pedido.cuponAplicado && !(await usarCupon(p.cuponId))) {
    sel = { ...sel, cupon: null }
    pedido = calcularPedido(cat, sel)
  }
  const medio = pedido.total === 0 ? "PRUEBA" : p.medio

  const creado = await prisma.posPedido.create({
    data: {
      cuentaId: p.cuentaId, plan: sel.plan, cajas: sel.cajas,
      items: JSON.stringify(pedido.lineas),
      subtotal: pedido.subtotal, descuento: pedido.descuento, total: pedido.total,
      cuponCodigo: pedido.cuponAplicado ? sel.cupon?.codigo ?? null : null,
      medio, estado: pedido.total === 0 ? "SIN_PAGO" : "PENDIENTE",
      maquinas: pedido.maquinas, direccionEnvio: pedido.maquinas ? p.facturacion.direccionEnvio : "",
    },
  })

  let pagarUrl: string | null = null, errorPago: string | null = null
  if (medio === "MERCADOPAGO") {
    try {
      pagarUrl = await linkPagoPedido(creado.id)
    } catch (e) {
      errorPago = e instanceof Error ? e.message : "Mercado Pago no respondió."
    }
  }
  return { pedidoId: creado.id, pedido, pagarUrl, errorPago }
}

/** Link de Mercado Pago de un pedido pendiente (lo crea si aún no existe o si se perdió). */
export async function linkPagoPedido(pedidoId: string): Promise<string> {
  const p = await prisma.posPedido.findUnique({
    where: { id: pedidoId },
    include: { cuenta: { include: { usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } } } },
  })
  if (!p) throw new ErrorPos("Pedido no encontrado.", 404)
  if (p.estado !== "PENDIENTE") throw new ErrorPos("Este pedido ya no está pendiente de pago.", 409)
  if (p.initPoint) return p.initPoint
  const cat = await getCatalogo()
  if (p.medio !== "MERCADOPAGO") await prisma.posPedido.update({ where: { id: p.id }, data: { medio: "MERCADOPAGO" } })
  return crearPreferencia(p.id, {
    lineas: leerLineas(p.items), descuento: p.descuento, total: p.total,
    email: p.cuenta.usuarios[0]?.email ?? "", nombre: p.cuenta.usuarios[0]?.nombre ?? "", local: p.cuenta.nombre, cuotas: cat.cuotas,
  })
}

// ─── Confirmar el pago ────────────────────────────────────────────────────────

async function operadorSistema() {
  const correo = (process.env.POS_OPERADOR_EMAIL || OWNER_EMAIL).trim().toLowerCase()
  const dueno = await prisma.user.findUnique({ where: { email: correo }, select: { id: true, nombre: true, activo: true } })
  if (dueno?.activo) return { id: dueno.id, nombre: "Mercado Pago (contratación online)" }
  const otro = await prisma.user.findFirst({ where: { role: "ADMIN", activo: true }, orderBy: { createdAt: "asc" }, select: { id: true } })
  if (!otro) throw new Error("No hay usuario ADMIN para registrar el pago")
  return { id: otro.id, nombre: "Mercado Pago (contratación online)" }
}

export type ResultadoPago = "pagado" | "repetido" | "pendiente" | "rechazado" | "ajeno" | "monto-no-calza" | "error-al-aplicar" | "sin-pedido"

/** Procesa un pago de Mercado Pago (por id) si pertenece a un pedido de contratación. Nunca lanza. */
export async function procesarPagoContratacion(paymentId: string): Promise<ResultadoPago> {
  if (!paymentId || !mpCheckoutListo()) return "ajeno"
  const r = await mp<MpPago>(`/v1/payments/${encodeURIComponent(paymentId)}`)
  if (!r.ok || !r.data?.id) { console.warn("[contratar] no se pudo leer el pago", paymentId, r.status); return "ajeno" }
  return aplicarPago(r.data)
}

async function aplicarPago(pago: MpPago): Promise<ResultadoPago> {
  const ref = String(pago.external_reference ?? "")
  if (!ref.startsWith("pedido:")) return "ajeno"
  const pedido = await prisma.posPedido.findUnique({ where: { id: ref.slice(7) }, include: { cuenta: { include: { cliente: true } } } })
  if (!pedido) return "sin-pedido"
  const mpId = String(pago.id)
  const log = (estado: ResultadoPago, extra: Record<string, unknown> = {}) =>
    console.info("[contratar]", { pedido: pedido.id, pago: mpId, estado, status: pago.status, monto: pago.transaction_amount, ...extra })

  if (pago.status === "rejected" || pago.status === "cancelled") {
    await prisma.posPedido.updateMany({ where: { id: pedido.id, estado: "PENDIENTE" }, data: { detalle: `Mercado Pago: ${pago.status} (${pago.status_detail ?? ""})`.slice(0, 300) } })
    log("rechazado")
    return "rechazado"
  }
  if (pago.status !== "approved") { log("pendiente"); return "pendiente" }

  if ((pago.currency_id ?? "CLP") !== "CLP" || Math.round(Number(pago.transaction_amount)) !== pedido.total) {
    await prisma.posPedido.updateMany({
      where: { id: pedido.id, estado: "PENDIENTE" },
      data: { detalle: `Pago ${mpId} por ${pago.currency_id} ${pago.transaction_amount}, distinto del pedido (${pedido.total}). No se aplicó.`.slice(0, 300) },
    })
    log("monto-no-calza")
    await avisoHypnos(pedido.id, `⚠️ Pago que no calza: ${pedido.cuenta.nombre}`, [
      `Mercado Pago informó el pago <strong>${esc(mpId)}</strong> por ${esc(String(pago.transaction_amount))} ${esc(String(pago.currency_id))}, pero el pedido es de ${esc(formatoCLP(pedido.total))}. No se aplicó: revísalo a mano.`,
    ]).catch(() => {})
    return "monto-no-calza"
  }

  // escritura condicional: el webhook y la página de retorno pueden llegar a la vez
  const otro = await prisma.posPedido.findUnique({ where: { mpPaymentId: mpId }, select: { id: true } })
  if (otro) { log("repetido"); return "repetido" }
  let tomado
  try {
    tomado = await prisma.posPedido.updateMany({
      where: { id: pedido.id, estado: "PENDIENTE" },
      data: { estado: "PAGADO", mpPaymentId: mpId, pagadoAt: pago.date_approved ? new Date(pago.date_approved) : new Date(), detalle: null },
    })
  } catch {
    log("repetido"); return "repetido" // mpPaymentId único
  }
  if (tomado.count === 0) { log("repetido"); return "repetido" }

  try {
    await aplicarPedidoPagado(pedido.id, `Mercado Pago ${mpId}${pago.installments && pago.installments > 1 ? ` · ${pago.installments} cuotas` : ""}`)
    log("pagado")
    return "pagado"
  } catch (e) {
    const detalle = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    await prisma.posPedido.update({ where: { id: pedido.id }, data: { estado: "ERROR", detalle } })
    console.error("[contratar] error al aplicar", pedido.id, detalle)
    await avisoHypnos(pedido.id, `⚠️ Pago cobrado sin aplicar: ${pedido.cuenta.nombre}`, [
      `Mercado Pago cobró ${esc(formatoCLP(pedido.total))} (pago ${esc(mpId)}), pero no se pudo registrar: ${esc(detalle)}. Regístralo a mano en la ficha.`,
    ]).catch(() => {})
    return "error-al-aplicar"
  }
}

/**
 * Registra en el panel lo que se pagó: plan (LICENCIA) y adicionales (DESARROLLO), marca las tareas
 * de Hypnos (puesta en marcha, despacho) y avisa. Lo usa Mercado Pago y "Marcar pagado" (transferencia).
 */
export async function aplicarPedidoPagado(pedidoId: string, respaldo: string, operador?: { id: string; nombre: string }, soloAdicionales = false) {
  const pedido = await prisma.posPedido.findUnique({ where: { id: pedidoId }, include: { cuenta: { include: { cliente: true } } } })
  if (!pedido) throw new ErrorPos("Pedido no encontrado.", 404)
  if (!pedido.cuenta.cliente) throw new ErrorPos("La cuenta no tiene licencia en la gobernanza.")
  const op = operador ?? await operadorSistema()
  const lineas = JSON.parse(pedido.items) as Linea[]
  const plan = lineas.find(l => l.clave === "plan")
  const licencia = Math.max((plan?.monto ?? 0) - pedido.descuento, 0)
  const meses = pedido.plan === "ANUAL" ? 12 : 1
  const notaBase = `Contratación online · ${respaldo}`

  let hasta: Date | null = null
  if (soloAdicionales) {
    // el plan ya se registró aprobando el comprobante en /admin/pos: no se cobra dos veces
  } else if (licencia > 0) {
    const r = await registrarPagoPos({
      cuentaId: pedido.cuentaId, monto: licencia, meses,
      notas: `Hypnos POS · plan ${pedido.plan === "ANUAL" ? "anual" : "mensual"} · ${notaBase}${pedido.cuponCodigo ? ` · cupón ${pedido.cuponCodigo}` : ""}`,
      comprobanteNota: `respaldo ${respaldo}`,
      operador: op, avisar: true,
    })
    hasta = r.hasta
  } else {
    // plan cubierto 100% por cupón: igual se activa el período
    await prisma.posCuenta.update({ where: { id: pedido.cuentaId }, data: { enPrueba: false } })
  }

  const extras = lineas.filter(l => (l.clave === "marcha" || l.clave === "point") && l.monto > 0)
  for (const l of extras) {
    await prisma.pago.create({
      data: {
        clienteId: pedido.cuenta.cliente.id, concepto: "DESARROLLO",
        conceptoDetalle: l.clave === "point" ? `Venta ${l.nombre} (Mercado Pago, revendedor)` : "Puesta en marcha asistida Hypnos POS",
        monto: l.monto, moneda: "CLP", notas: notaBase, comprobanteNota: `respaldo ${respaldo}`,
        registradoPorId: op.id,
      },
    })
  }
  const tieneMarcha = lineas.some(l => l.clave === "marcha")
  await prisma.posPedido.update({
    where: { id: pedido.id },
    data: {
      ...(pedido.maquinas > 0 && !pedido.despacho ? { despacho: "POR_DESPACHAR" } : {}),
      ...(tieneMarcha && !pedido.marcha ? { marcha: "POR_AGENDAR" } : {}),
    },
  })
  await logActividad({
    usuarioId: op.id, usuarioNombre: op.nombre, clienteId: pedido.cuenta.cliente.id, clienteNombre: pedido.cuenta.nombre,
    accion: "PAGO_REGISTRADO", detalle: `[Hypnos POS] Contratación online pagada: ${formatoCLP(pedido.total)} · ${respaldo}`,
  })
  await avisoPedido(pedido.id, "pagado", hasta).catch(e => console.error("[contratar] aviso:", e))
}

/** Relee en Mercado Pago los pagos del pedido (página de retorno y botón "Revisar" del admin). */
export async function sincronizarPedido(pedidoId: string): Promise<string> {
  const pedido = await prisma.posPedido.findUnique({ where: { id: pedidoId }, select: { id: true, estado: true, medio: true } })
  if (!pedido) return "sin-pedido"
  if (pedido.estado !== "PENDIENTE" || pedido.medio !== "MERCADOPAGO" || !mpCheckoutListo()) return pedido.estado.toLowerCase()
  const r = await mp<{ results?: MpPago[] }>(`/v1/payments/search?external_reference=${encodeURIComponent(`pedido:${pedidoId}`)}&sort=date_created&criteria=desc&limit=10`)
  if (!r.ok) return "pendiente"
  const pagos = r.data?.results ?? []
  const aprobado = pagos.find(x => x.status === "approved")
  if (aprobado) return aplicarPago(aprobado)
  if (pagos[0]) return aplicarPago(pagos[0])
  return "pendiente"
}

/** merchant_order (aviso de la preferencia): procesa sus pagos. */
export async function procesarOrdenComercial(id: string): Promise<string> {
  if (!id || !mpCheckoutListo()) return "ajeno"
  const r = await mp<{ external_reference?: string; payments?: { id: number | string }[] }>(`/merchant_orders/${encodeURIComponent(id)}`)
  if (!r.ok || !String(r.data?.external_reference ?? "").startsWith("pedido:")) return "ajeno"
  const res: string[] = []
  for (const p of r.data.payments ?? []) res.push(await procesarPagoContratacion(String(p.id)))
  return res.join(",") || "sin-pagos"
}

/** Transferencia confirmada por Hypnos (botón "Marcar pagado" de /admin/pos/contratar). */
export async function marcarPedidoPagado(pedidoId: string, operador: { id: string; nombre: string }, soloAdicionales: boolean) {
  const r = await prisma.posPedido.updateMany({ where: { id: pedidoId, estado: { in: ["PENDIENTE", "ERROR"] } }, data: { estado: "PAGADO", pagadoAt: new Date(), detalle: null } })
  if (r.count === 0) throw new ErrorPos("Este pedido ya no está pendiente.", 409)
  try {
    await aplicarPedidoPagado(pedidoId, `confirmado por ${operador.nombre}`, operador, soloAdicionales)
  } catch (e) {
    await prisma.posPedido.update({ where: { id: pedidoId }, data: { estado: "ERROR", detalle: (e instanceof Error ? e.message : String(e)).slice(0, 300) } })
    throw e
  }
}

// ─── Avisos ───────────────────────────────────────────────────────────────────

async function avisoHypnos(pedidoId: string, subject: string, parrafos: string[]) {
  const pedido = await prisma.posPedido.findUnique({ where: { id: pedidoId }, select: { cuentaId: true } })
  await enviarCorreoPos({
    to: correoAvisosHypnos(), subject, titulo: subject, parrafos,
    boton: { texto: "Ver pedidos", link: `${basePublica()}/admin/pos/contratar${pedido ? `?cuenta=${pedido.cuentaId}` : ""}` },
  })
}

/** Correo a Hypnos con el pedido: al crearlo (nuevo) y al pagarse (con las tareas). */
export async function avisoPedido(pedidoId: string, momento: "nuevo" | "pagado", hasta?: Date | null) {
  const p = await prisma.posPedido.findUnique({
    where: { id: pedidoId },
    include: { cuenta: { include: { usuarios: { where: { rol: "DUENO" }, take: 1 } } } },
  })
  if (!p) return
  const lineas = JSON.parse(p.items) as Linea[]
  const dueno = p.cuenta.usuarios[0]
  const wa = whatsappDigitos(p.cuenta.whatsapp)
  const tareas: string[] = []
  if (momento === "pagado") {
    if (p.marcha) tareas.push("📅 <strong>Agendar la puesta en marcha</strong> por WhatsApp.")
    if (p.maquinas) tareas.push(`📦 <strong>Despachar ${p.maquinas} Point Smart 2</strong> a: ${esc(p.direccionEnvio || "(sin dirección)")}. Anota los números de serie en el pedido.`)
  }
  const medio = p.medio === "MERCADOPAGO" ? "Mercado Pago" : p.medio === "TRANSFERENCIA" ? "Transferencia (falta el comprobante)" : "Prueba gratis"
  await avisoHypnos(p.id,
    momento === "pagado" ? `💰 Contratación pagada: ${p.cuenta.nombre} (${formatoCLP(p.total)})` : `🛒 Nueva contratación: ${p.cuenta.nombre}`,
    [
      `<strong>${esc(p.cuenta.nombre)}</strong> · ${p.cuenta.tipo === "ALMACEN" ? "almacén" : "restaurante"} · plan ${p.plan === "ANUAL" ? "anual" : "mensual"} · ${p.cajas} caja(s)`,
      lineas.map(l => `${esc(l.nombre)}: ${l.monto ? esc(formatoCLP(l.monto)) : "gratis"}`).join("<br>")
        + (p.descuento ? `<br>Cupón ${esc(p.cuponCodigo ?? "")}: −${esc(formatoCLP(p.descuento))}` : "")
        + `<br><strong>Total: ${esc(formatoCLP(p.total))}</strong> · ${esc(medio)}`,
      `Dueño: ${esc(dueno?.nombre ?? "")} · ${esc(dueno?.email ?? "")} · WhatsApp ${wa ? `<a href="https://wa.me/${wa}">+${wa}</a>` : esc(p.cuenta.whatsapp)}`
        + (p.cuenta.rut ? `<br>RUT ${esc(formatoRut(p.cuenta.rut))} · ${esc(p.cuenta.razonSocial)} · ${esc(p.cuenta.comuna)}` : ""),
      ...(hasta ? [`Plan activo hasta ${esc(hasta.toLocaleDateString("es-CL", { timeZone: "America/Santiago" }))}.`] : []),
      ...tareas,
    ])
}

export function leerLineas(items: string): Linea[] {
  try { return JSON.parse(items) as Linea[] } catch { return [] }
}
