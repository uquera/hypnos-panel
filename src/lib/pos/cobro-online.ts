import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"
import { OWNER_EMAIL } from "@/lib/auth"
import { createTuuPayment, telefonoCl, tuuOnlineConfig, type TuuOnlineConfig } from "@/lib/tuu-online"
import { ErrorPos } from "./usuarios"
import { correoCobroDe, precioDe, registrarPagoPos } from "./cobro"
import { opcionesPago } from "./links-pago"
import { claveDiaChile } from "./fechas"
import { formatoCLP } from "./config"
import { avisoHypnosPagoOnline } from "./correos"

// Cobro en línea de la licencia de Hypnos POS con TUU (Webpay):
//   1. crearCobroOnline: monto calculado en el servidor + PosCobroOnline PENDIENTE con referencia única → URL de TUU.
//   2. procesarCallbackTuu: el callback firmado de TUU (única prueba de pago) marca PAGADO con escritura
//      condicional (idempotente ante reintentos) y renueva con registrarPagoPos: max(vencimiento, hoy) + meses,
//      Pago LICENCIA con su período, sin suspensión ni prueba, PATCH + POST a la instancia y un correo al dueño.
// La página de retorno solo lee la base: el retorno del navegador no prueba ningún pago.

export const RUTA_CALLBACK = "/api/pos-pago/tuu-callback"
export const rutaResultado = (ref: string) => `/pos/pago-resultado?ref=${encodeURIComponent(ref)}`

const MESES_ANUAL = 12
/** Pago anual sin link configurado: 10 mensualidades (2 meses de regalo), como el link anual de TUU. */
const MENSUALIDADES_ANUAL = 10

export interface PlanOnline { meses: number; monto: number }

/** Planes que se pueden pagar en línea para ese precio mensual: el mes y el año (y otros configurados). */
export async function planesOnline(precio: number): Promise<PlanOnline[]> {
  const out = new Map<number, number>([[1, precio], [MESES_ANUAL, precio * MENSUALIDADES_ANUAL]])
  // los montos de varios meses configurados en /admin/pos (links de pago) mandan sobre el cálculo por defecto
  for (const o of await opcionesPago(precio)) if (o.meses > 1) out.set(o.meses, o.monto)
  return [...out].map(([meses, monto]) => ({ meses, monto })).sort((a, b) => a.meses - b.meses)
}

/** Monto que cobra el servidor por esos meses, o null si no es un plan válido. */
export async function montoPlan(precio: number, meses: number): Promise<number | null> {
  return (await planesOnline(precio)).find(p => p.meses === meses)?.monto ?? null
}

// ─── Link de pago por cuenta (correo del cron / enviado por WhatsApp) ─────────

function secreto(): string {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!s) throw new Error("Falta NEXTAUTH_SECRET")
  return s
}

/** Token del link de pago de una cuenta (no expira: solo permite iniciar un pago de esa cuenta). */
export function tokenPago(cuentaId: string): string {
  return createHmac("sha256", secreto()).update(`pos-pago:${cuentaId}`).digest("base64url").slice(0, 32)
}

export function tokenPagoValido(cuentaId: string, token: string): boolean {
  if (!cuentaId || !token) return false
  const a = Buffer.from(tokenPago(cuentaId))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Link absoluto de pago en línea de la cuenta, o null si TUU en línea no está configurado. */
export function linkPagoOnline(cuentaId: string): string | null {
  const cfg = tuuOnlineConfig()
  if (!cfg) return null
  return `${cfg.baseUrl}/pos/pagar?c=${encodeURIComponent(cuentaId)}&t=${tokenPago(cuentaId)}`
}

// ─── 1. Crear cobro ────────────────────────────────────────────────────────────

function nuevaReferencia(periodo: string) {
  return `HP-${periodo.replace(/-/g, "")}-${randomBytes(5).toString("hex").toUpperCase()}`
}

export async function crearCobroOnline(p: { cuentaId: string; meses: number; origen: "PORTAL" | "LINK" }): Promise<{ url: string; referencia: string }> {
  const cfg = tuuOnlineConfig()
  if (!cfg) throw new ErrorPos("El pago en línea no está disponible. Paga por transferencia y sube el comprobante.", 409)

  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: p.cuentaId },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!cuenta || cuenta.eliminadaAt) throw new ErrorPos("Cuenta no encontrada.", 404)
  if (!cuenta.cliente || !cuenta.cliente.activo) throw new ErrorPos("Tu cuenta aún no tiene un plan asociado. Escríbenos a contacto@hypnosapps.com.", 409)
  if (!cuenta.activo) throw new ErrorPos("Tu cuenta está bloqueada. Escríbenos a contacto@hypnosapps.com.", 403)

  const meses = Math.round(Number(p.meses))
  const monto = await montoPlan(precioDe(cuenta), meses)
  if (!monto) throw new ErrorPos("Elige un plan válido.")

  const email = correoCobroDe(cuenta)
  if (!email) throw new ErrorPos("Tu cuenta no tiene correo de contacto. Escríbenos a contacto@hypnosapps.com.", 409)

  const periodo = claveDiaChile(cuenta.cliente.fechaVencimiento)
  const referencia = nuevaReferencia(periodo)
  const cobro = await prisma.posCobroOnline.create({
    data: { referencia, cuentaId: cuenta.id, periodo, meses, monto, origen: p.origen, ambiente: cfg.env },
  })

  const intento = await createTuuPayment(cfg, {
    amount: monto,
    reference: referencia,
    description: `Hypnos POS ${cuenta.nombre} ${meses === 1 ? "1 mes" : `${meses} meses`}`,
    shopName: "Hypnos POS",
    customerName: cuenta.usuarios[0]?.nombre || cuenta.nombre,
    email,
    phone: telefonoCl(cuenta.whatsapp),
    callbackPath: RUTA_CALLBACK,
    completePath: rutaResultado(referencia),
    cancelPath: `${rutaResultado(referencia)}&cancelado=1`,
  })
  if (!intento.ok) {
    await prisma.posCobroOnline.updateMany({ where: { id: cobro.id, estado: "PENDIENTE" }, data: { estado: "FALLIDO", detalle: "No se pudo crear el intento en TUU" } })
    throw new ErrorPos(intento.error, 502)
  }
  return { url: intento.url, referencia }
}

// ─── 2. Callback de TUU ───────────────────────────────────────────────────────

/**
 * Usuario del panel con el que queda registrado un pago en línea.
 *
 * `Pago.registradoPorId` exige un usuario y, sin reparto de custodia, el ingreso queda a su
 * nombre. Eso es lo correcto aquí: el cobro entra a la cuenta de TUU, que es del dueño de
 * Hypnos. Se busca por correo —no por "el primer ADMIN creado"—, porque ese orden cambia
 * solo (se desactiva una cuenta, se crea otra antes) y dejaría los pagos ya cobrados por
 * TUU en estado ERROR. Se puede fijar otro con POS_OPERADOR_EMAIL.
 */
async function operadorSistema() {
  const correo = (process.env.POS_OPERADOR_EMAIL || OWNER_EMAIL).trim().toLowerCase()
  const dueno = await prisma.user.findUnique({ where: { email: correo }, select: { id: true, nombre: true, activo: true } })
  if (dueno?.activo) return { id: dueno.id, nombre: dueno.nombre }

  // Respaldo: TUU ya cobró, así que antes de perder el pago se registra con cualquier ADMIN
  const otro = await prisma.user.findFirst({ where: { role: "ADMIN", activo: true }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true } })
  if (!otro) throw new Error(`No hay usuario para registrar el pago (${correo} no existe o está inactivo, y no queda ningún ADMIN activo)`)
  console.warn("[tuu-licencia] operador de respaldo", { esperado: correo, usado: otro.nombre })
  return { id: otro.id, nombre: otro.nombre }
}

export type ResultadoCallback =
  | "pagado" | "repetido" | "fallido" | "ignorado" | "sin-cobro" | "monto-no-calza" | "error-al-aplicar"

/**
 * Procesa un callback YA verificado (firma y x_account_id). Nunca lanza: el route responde 200
 * a toda firma válida para que TUU deje de reintentar.
 */
export async function procesarCallbackTuu(f: Record<string, string>, cfg: TuuOnlineConfig): Promise<ResultadoCallback> {
  const referencia = (f.x_reference ?? "").trim()
  const resultado = (f.x_result ?? "").trim()
  const log = (estado: ResultadoCallback, extra: Record<string, unknown> = {}) =>
    console.info("[tuu-licencia]", { referencia, estado, monto: f.x_amount, resultado, ...extra })

  const cobro = referencia ? await prisma.posCobroOnline.findUnique({ where: { referencia }, include: { cuenta: true } }) : null
  if (!cobro) { log("sin-cobro"); return "sin-cobro" }

  if (resultado === "failed") {
    await prisma.posCobroOnline.updateMany({ where: { id: cobro.id, estado: "PENDIENTE" }, data: { estado: "FALLIDO", resultado } })
    log("fallido")
    return "fallido"
  }
  if (resultado !== "completed") { log("ignorado"); return "ignorado" } // pending u otro: queda igual

  // un cobro creado en el ambiente de pruebas nunca se aplica con la configuración de producción (y viceversa)
  if (cobro.ambiente !== cfg.env) { log("ignorado", { motivo: "ambiente distinto" }); return "ignorado" }

  const monto = Number(f.x_amount)
  if ((f.x_currency ?? "CLP") !== "CLP" || !Number.isFinite(monto) || Math.round(monto) !== cobro.monto) {
    await prisma.posCobroOnline.updateMany({
      where: { id: cobro.id, estado: { in: ["PENDIENTE", "FALLIDO"] } },
      data: { detalle: `Callback con monto/moneda que no calza: ${f.x_currency ?? "?"} ${f.x_amount ?? "?"} (esperado CLP ${cobro.monto})`.slice(0, 300) },
    })
    log("monto-no-calza", { esperado: cobro.monto })
    await avisoHypnosPagoOnline({
      restaurante: cobro.cuenta.nombre, referencia, monto: cobro.monto,
      problema: `TUU informó un pago por ${f.x_currency ?? "?"} ${f.x_amount ?? "?"}, distinto del cobro. No se renovó la licencia.`,
    }).catch(e => console.error("[tuu-licencia] aviso:", e))
    return "monto-no-calza"
  }

  // escritura condicional: dos callbacks simultáneos o un reintento de TUU no pueden renovar dos veces
  const tomado = await prisma.posCobroOnline.updateMany({
    where: { id: cobro.id, estado: { in: ["PENDIENTE", "FALLIDO"] } },
    data: { estado: "PAGADO", resultado, pagadoAt: new Date(), detalle: null },
  })
  if (tomado.count === 0) { log("repetido"); return "repetido" }

  try {
    const r = await registrarPagoPos({
      cuentaId: cobro.cuentaId,
      monto: cobro.monto,
      meses: cobro.meses,
      notas: `Hypnos POS · pago en línea TUU ${referencia} · ${cobro.meses === 1 ? "1 mes" : `${cobro.meses} meses`}`,
      // No hay archivo que adjuntar: el respaldo es la transacción de TUU. Se deja escrito
      // para que el ingreso no se vea como uno cargado a mano y sin documento.
      comprobanteNota: `respaldo TUU · ${referencia}`,
      operador: await operadorSistema(),
      avisar: true, // un solo correo de comprobante al dueño (este callback gana una sola vez)
    })
    await prisma.posCobroOnline.update({ where: { id: cobro.id }, data: { pagoId: r.pago.id, hasta: r.hasta } })
    log("pagado", { hasta: r.hasta.toISOString(), sincronizado: r.syncedRemote })
    if (!r.syncedRemote) {
      await avisoHypnosPagoOnline({
        restaurante: cobro.cuenta.nombre, referencia, monto: cobro.monto,
        problema: `Pago aplicado en el panel (activo hasta ${claveDiaChile(r.hasta)}), pero la instancia no respondió: ${r.syncError ?? "sin detalle"}. Sincroniza desde la ficha.`,
      }).catch(e => console.error("[tuu-licencia] aviso:", e))
    }
    return "pagado"
  } catch (e) {
    const detalle = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    await prisma.posCobroOnline.update({ where: { id: cobro.id }, data: { estado: "ERROR", detalle } })
    console.error("[tuu-licencia]", { referencia, estado: "error-al-aplicar", monto: cobro.monto, detalle })
    await avisoHypnosPagoOnline({
      restaurante: cobro.cuenta.nombre, referencia, monto: cobro.monto,
      problema: `TUU confirmó el pago de ${formatoCLP(cobro.monto)}, pero no se pudo renovar la licencia: ${detalle}. Regístralo a mano en la ficha.`,
    }).catch(err => console.error("[tuu-licencia] aviso:", err))
    return "error-al-aplicar"
  }
}
