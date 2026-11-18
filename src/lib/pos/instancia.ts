import { createHash, createHmac, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import { ErrorPos } from "./usuarios"
import { estadoPos, precioDe, correoCobroDe } from "./cobro"
import { basePortal } from "./servidor"
import { linkPagoOnline } from "./cobro-online"
import { crearSuscripcion, cancelarSuscripcion, sincronizarSuscripcion, detalleSuscripcionMp, mpSuscripcionesListas } from "./mp-suscripcion"
import { ofertaAnual, crearPedidoAnualPortal, linkPagoPedido } from "./contratar"
import { fechaLarga } from "./fechas"

// Módulo «Mi suscripción» del POS: cada local (instancia de pos-saas) consulta aquí su plan,
// su pago automático y sus pagos, y pide los links de Mercado Pago. Se autentica con su
// GOBERNANZA_MASTER_KEY (cabecera X-Master-Key), la misma que el panel usa para hablarle:
// el local se identifica por la clave, nunca por un dato que mande él.

const sha = (s: string) => createHash("sha256").update(s.trim()).digest()

/** Cuenta POS cuya instancia tiene esta clave maestra (comparación en tiempo constante), o null. */
export async function cuentaPorClave(clave: string | null) {
  if (!clave || clave.trim().length < 32) return null
  const buscada = sha(clave)
  const cuentas = await prisma.posCuenta.findMany({
    where: { eliminadaAt: null, clienteId: { not: null } },
    select: { id: true, cliente: { select: { masterKey: true } } },
  })
  let hallada: string | null = null
  for (const c of cuentas) {
    if (c.cliente?.masterKey && timingSafeEqual(sha(c.cliente.masterKey), buscada)) hallada = c.id
  }
  return hallada
}

// ─── Recibo (comprobante) de un pago ───────────────────────────────────────────

function secreto(): string {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!s) throw new Error("Falta NEXTAUTH_SECRET")
  return s
}
export const tokenRecibo = (pagoId: string) => createHmac("sha256", secreto()).update(`pos-recibo:${pagoId}`).digest("base64url").slice(0, 32)
export function tokenReciboValido(pagoId: string, t: string) {
  if (!pagoId || !t) return false
  const a = Buffer.from(tokenRecibo(pagoId))
  const b = Buffer.from(t)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const linkRecibo = (pagoId: string) => `${basePortal()}/pos/recibo/${encodeURIComponent(pagoId)}?t=${tokenRecibo(pagoId)}`

/** Cómo se pagó, a partir de las notas que deja cada camino de registro. */
export function medioDePago(notas: string | null, comprobante: string | null): string {
  const n = (notas ?? "").toLowerCase()
  if (n.includes("cobro automático mercado pago")) return "Pago automático (Mercado Pago)"
  if (n.includes("mercado pago")) return "Mercado Pago"
  if (n.includes("tuu") || n.includes("webpay")) return "Webpay"
  if (comprobante || n.includes("transferencia") || n.includes("comprobante")) return "Transferencia"
  return "Registrado por Hypnos"
}

// ─── Resumen ──────────────────────────────────────────────────────────────────

export type EstadoModulo = "prueba" | "activa" | "por_vencer" | "vencida" | "suspendida"

export async function resumenSuscripcion(cuentaId: string) {
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: cuentaId },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1, select: { email: true } } },
  })
  if (!cuenta?.cliente || cuenta.eliminadaAt) throw new ErrorPos("Cuenta no encontrada.", 404)
  const cliente = cuenta.cliente
  const { estado, dias } = estadoPos(cuenta)
  const estadoModulo: EstadoModulo =
    estado === "SUSPENDIDO" ? "suspendida" : estado === "VENCIDO" ? "vencida" : estado === "EN_PRUEBA" ? "prueba" : estado === "POR_VENCER" ? "por_vencer" : "activa"
  const precio = precioDe(cuenta)

  // pago automático: la autorizada (o pausada) manda; una pendiente es un alta o un cambio de tarjeta a medias
  const vivas = await prisma.posSuscripcion.findMany({
    where: { cuentaId, estado: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    include: { cobros: { where: { estado: "approved" }, orderBy: { createdAt: "desc" }, take: 1 } },
  })
  const activa = vivas.find((s) => s.estado === "authorized" || s.estado === "paused") ?? null
  const pendiente = vivas.find((s) => s.estado === "pending") ?? null
  const principal = activa ?? pendiente
  const det = principal ? await detalleSuscripcionMp(principal.mpId, principal.cobros[0]?.mpPaymentId ?? null) : null

  const [pagos, rechazos, oferta] = await Promise.all([
    prisma.pago.findMany({
      where: { clienteId: cliente.id },
      orderBy: { fechaPago: "desc" },
      take: 36,
      select: { id: true, concepto: true, conceptoDetalle: true, monto: true, moneda: true, fechaPago: true, periodoInicio: true, periodoFin: true, notas: true, comprobante: true },
    }),
    prisma.posSuscripcionCobro.findMany({
      where: { suscripcion: { cuentaId }, estado: { not: "approved" } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, monto: true, estado: true, createdAt: true },
    }),
    ofertaAnual(cuentaId).catch(() => null),
  ])

  const historial = [
    ...pagos.map((p) => ({
      id: p.id,
      fecha: p.fechaPago.toISOString(),
      detalle: p.concepto === "LICENCIA"
        ? `Plan Hypnos POS${p.periodoInicio && p.periodoFin ? ` · ${fechaLarga(p.periodoInicio)} al ${fechaLarga(p.periodoFin)}` : ""}`
        : (p.conceptoDetalle || (p.concepto === "DESARROLLO" ? "Puesta en marcha / equipos" : p.concepto)),
      monto: p.monto,
      moneda: p.moneda,
      medio: medioDePago(p.notas, p.comprobante),
      estado: "pagado" as const,
      recibo: linkRecibo(p.id),
    })),
    ...rechazos.map((r) => ({
      id: r.id,
      fecha: r.createdAt.toISOString(),
      detalle: "Cobro automático de la mensualidad",
      monto: r.monto,
      moneda: "CLP",
      medio: "Pago automático (Mercado Pago)",
      estado: (r.estado === "rejected" ? "rechazado" : r.estado) as string,
      recibo: null,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return {
    local: cuenta.nombre,
    plan: {
      nombre: cuenta.planPeriodo === "ANUAL" ? "Hypnos POS · plan anual" : "Hypnos POS · plan mensual",
      periodo: cuenta.planPeriodo,
      cajas: cuenta.cajas,
      precioMensual: precio,
    },
    estado: estadoModulo,
    diasRestantes: dias,
    vencimiento: cliente.fechaVencimiento.toISOString(),
    pagoAutomatico: {
      disponible: mpSuscripcionesListas(),
      estado: activa ? (activa.estado === "paused" ? "pausada" : "activa") : pendiente ? "pendiente" : "sin",
      monto: principal?.monto ?? precio,
      correo: principal?.payerEmail || correoCobroDe(cuenta) || "",
      proximoCobro: activa ? det?.proximoCobro ?? null : null,
      ultimoCobro: activa?.ultimoCobroAt?.toISOString() ?? null,
      tarjeta: activa ? det?.tarjeta ?? null : null,
      // alta o cambio de tarjeta sin terminar: link para seguir en Mercado Pago
      linkPendiente: pendiente?.initPoint || null,
      cambioEnCurso: Boolean(activa && pendiente),
    },
    anual: oferta && !oferta.yaAnual ? { anual: oferta.anual, ahorro: oferta.ahorro, cuotas: oferta.cuotas, cuotasSinInteres: oferta.cuotasSinInteres, incluyeMarcha: oferta.incluyeMarcha } : null,
    // link de pago sin sesión (mismo del correo de cobro): sirve también con el sistema en pausa
    linkPagar: linkPagoOnline(cuentaId),
    historial,
  }
}

// ─── Acciones ─────────────────────────────────────────────────────────────────

/** La vuelta desde Mercado Pago solo puede ir al propio local (nunca a otro dominio). */
async function vueltaSegura(cuentaId: string, url: unknown): Promise<string | undefined> {
  if (typeof url !== "string" || !url) return undefined
  const c = await prisma.posCuenta.findUnique({ where: { id: cuentaId }, select: { posUrl: true } })
  try {
    const destino = new URL(url)
    return c && destino.protocol === "https:" && destino.host === new URL(c.posUrl).host ? destino.toString() : undefined
  } catch {
    return undefined
  }
}

export async function accionSuscripcion(cuentaId: string, body: { accion?: string; email?: string; volver?: string; por?: string }) {
  const por = `POS: ${String(body.por ?? "admin del local").slice(0, 80)}`
  switch (body.accion) {
    case "suscribir":
    case "cambiar-tarjeta": {
      const cuenta = await prisma.posCuenta.findUnique({ where: { id: cuentaId }, include: { cliente: true, usuarios: { where: { rol: "DUENO" }, take: 1, select: { email: true } } } })
      const email = String(body.email ?? "").trim() || (cuenta ? correoCobroDe(cuenta) ?? "" : "")
      const sus = await crearSuscripcion({
        cuentaId, email, creadoPor: por.slice(0, 120),
        backUrl: await vueltaSegura(cuentaId, body.volver),
        reemplazar: body.accion === "cambiar-tarjeta",
      })
      if (!sus.initPoint) throw new ErrorPos("Mercado Pago no entregó el link. Intenta de nuevo en unos minutos.", 502)
      return { url: sus.initPoint }
    }
    case "cancelar":
      await cancelarSuscripcion(cuentaId, por)
      return { ok: true }
    case "anual": {
      const pedidoId = await crearPedidoAnualPortal(cuentaId)
      return { url: await linkPagoPedido(pedidoId) }
    }
    case "sincronizar": {
      // al volver de Mercado Pago: relee estado y cuotas sin esperar el aviso
      const vivas = await prisma.posSuscripcion.findMany({ where: { cuentaId, estado: { not: "cancelled" } }, select: { mpId: true } })
      let registradas = 0
      for (const s of vivas) registradas += (await sincronizarSuscripcion(s.mpId)).registradas
      return { ok: true, registradas }
    }
    default:
      throw new ErrorPos("Acción no válida.")
  }
}
