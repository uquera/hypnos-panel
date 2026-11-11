import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { patchLicenciaRemota, postPagoRemoto } from "@/lib/gobernanza-remota"
import { ErrorPos } from "./usuarios"
import { precioMensual } from "./config"
import { diasHastaChile, sumarMeses, fechaLarga } from "./fechas"
import { correoPagoAprobado } from "./correos"

// Cobro mensual de Hypnos POS: estado de cada restaurante, registro de pagos
// (comprobante aprobado o pago manual) y cambios de licencia sincronizados con la instancia.

export type EstadoPos =
  | "ELIMINADA" | "INSTALANDO" | "ERROR" | "SUSPENDIDO" | "EN_PRUEBA" | "VENCIDO" | "POR_VENCER" | "AL_DIA" | "MANUAL"

export const ETIQUETA_ESTADO: Record<EstadoPos, string> = {
  ELIMINADA:  "Eliminada",
  INSTALANDO: "Instalando",
  ERROR:      "Error de instalación",
  SUSPENDIDO: "Suspendido",
  EN_PRUEBA:  "En prueba",
  VENCIDO:    "Vencido",
  POR_VENCER: "Por vencer",
  AL_DIA:     "Al día",
  MANUAL:     "Instalación manual",
}

export const DIAS_POR_VENCER = 5

export interface CuentaParaEstado {
  estadoAlta: string; enPrueba: boolean; eliminadaAt: Date | null
  cliente: { suspendida: boolean; fechaVencimiento: Date } | null
}

export function estadoPos(c: CuentaParaEstado, hoy = new Date()): { estado: EstadoPos; dias: number | null } {
  if (c.eliminadaAt) return { estado: "ELIMINADA", dias: null }
  if (c.estadoAlta === "PENDIENTE" || c.estadoAlta === "INSTALANDO") return { estado: "INSTALANDO", dias: null }
  if (c.estadoAlta === "ERROR") return { estado: "ERROR", dias: null }
  if (!c.cliente) return { estado: "MANUAL", dias: null }
  const dias = diasHastaChile(c.cliente.fechaVencimiento, hoy)
  if (c.cliente.suspendida) return { estado: "SUSPENDIDO", dias }
  if (dias < 0) return { estado: "VENCIDO", dias }
  if (c.enPrueba) return { estado: "EN_PRUEBA", dias }
  if (dias <= DIAS_POR_VENCER) return { estado: "POR_VENCER", dias }
  return { estado: "AL_DIA", dias }
}

export function precioDe(c: { precioMensual: number | null }): number {
  return c.precioMensual ?? precioMensual()
}

interface Operador { id: string; nombre: string }

async function cuentaConCliente(cuentaId: string) {
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: cuentaId },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!cuenta) throw new ErrorPos("Cuenta no encontrada.", 404)
  if (!cuenta.cliente) throw new ErrorPos("Esta cuenta no tiene licencia en la gobernanza (instalación manual).")
  return { cuenta, cliente: cuenta.cliente }
}

/** Correo al que se avisa del cobro: el del cliente o el del dueño. */
export function correoCobroDe(c: { cliente: { emailContacto: string | null } | null; usuarios: { email: string }[] }): string | null {
  return c.cliente?.emailContacto || c.usuarios[0]?.email || null
}

/**
 * Registra un pago mensual: Pago (LICENCIA, CLP) con período max(vencimiento, hoy) → +N meses,
 * extiende el vencimiento, quita suspensión y prueba, sincroniza con la instancia y avisa al dueño.
 *
 * Es un ingreso del estándar de Hypnos: puede llevar comprobante (archivo ya guardado en
 * uploads/comprobantes) y custodia del dinero. Sin custodias explícitas el custodio es
 * quien lo registra, igual que en el resto de Ingresos (custodioId null = registradoPor).
 */
export async function registrarPagoPos(p: {
  cuentaId: string; monto: number; meses?: number; fechaPago?: Date; notas?: string | null
  comprobante?: string | null           // archivo en uploads/comprobantes (visible en Ingresos)
  comprobanteOk?: boolean | null        // resultado del validador (null = no evaluado)
  comprobanteNota?: string | null
  comprobanteHash?: string | null
  custodias?: { userId: string; monto: number }[]
  operador: Operador
  avisar?: boolean
}) {
  const { cuenta, cliente } = await cuentaConCliente(p.cuentaId)
  if (!(p.monto > 0)) throw new ErrorPos("El monto debe ser mayor a 0.")
  const meses = Math.min(Math.max(Math.round(p.meses ?? 1), 1), 12)

  const custodias = (p.custodias ?? []).filter(c => c.monto > 0)
  if (custodias.length > 0) {
    const suma = custodias.reduce((s, c) => s + c.monto, 0)
    if (Math.abs(suma - p.monto) > 0.5) throw new ErrorPos("El reparto de custodia no cuadra con el monto del pago.")
    const existentes = await prisma.user.count({ where: { id: { in: custodias.map(c => c.userId) } } })
    if (existentes !== custodias.length) throw new ErrorPos("Custodia con usuario inexistente.")
  }

  const ahora  = new Date()
  const inicio = cliente.fechaVencimiento > ahora ? cliente.fechaVencimiento : ahora
  const fin    = sumarMeses(inicio, meses)
  const fechaPago = p.fechaPago ?? ahora

  const pago = await prisma.$transaction(async tx => {
    const creado = await tx.pago.create({
      data: {
        clienteId: cliente.id, concepto: "LICENCIA", monto: p.monto, moneda: "CLP",
        periodoInicio: inicio, periodoFin: fin, fechaPago,
        comprobante: p.comprobante ?? null,
        comprobanteOk:   p.comprobanteOk ?? null,
        comprobanteNota: p.comprobanteNota ?? null,
        comprobanteHash: p.comprobanteHash ?? null,
        notas: p.notas ?? `Hypnos POS · ${meses} mes${meses > 1 ? "es" : ""}`,
        registradoPorId: p.operador.id,
      },
    })
    if (custodias.length > 0) {
      await tx.pagoCustodia.createMany({ data: custodias.map(c => ({ pagoId: creado.id, userId: c.userId, monto: c.monto })) })
    }
    await tx.cliente.update({ where: { id: cliente.id }, data: { fechaVencimiento: fin, suspendida: false } })
    await tx.posCuenta.update({ where: { id: cuenta.id }, data: { enPrueba: false } })
    return creado
  })

  // Nombres de los custodios para la auditoría (sin custodias = quien registró)
  const custodioLabel = custodias.length > 0
    ? (await prisma.user.findMany({ where: { id: { in: custodias.map(c => c.userId) } }, select: { nombre: true } }))
        .map(u => u.nombre).join(" + ")
    : p.operador.nombre

  const [lic] = await Promise.all([
    patchLicenciaRemota(cliente, { fechaVencimiento: fin.toISOString(), suspendida: false, enPrueba: false }),
    postPagoRemoto(cliente, {
      monto: p.monto, moneda: "CLP", periodoInicio: inicio.toISOString(), periodoFin: fin.toISOString(),
      fechaPago: fechaPago.toISOString(), notas: pago.notas,
    }),
  ])

  await logActividad({
    usuarioId: p.operador.id, usuarioNombre: p.operador.nombre, clienteId: cliente.id, clienteNombre: cliente.nombre,
    accion: "PAGO_REGISTRADO",
    detalle: `[Hypnos POS] CLP $${p.monto.toLocaleString("es-CL")} · hasta ${fechaLarga(fin)}${p.comprobante ? (p.comprobanteOk === false ? ` · comprobante sin verificar (${p.comprobanteNota})` : " · con comprobante") : (p.comprobanteNota ? ` · ${p.comprobanteNota}` : " · sin comprobante")} · Custodio: ${custodioLabel} · Registró: ${p.operador.nombre}${lic.ok ? "" : " · sin sincronizar"}`,
  })

  const to = correoCobroDe(cuenta)
  if (p.avisar !== false && to) {
    await correoPagoAprobado({ to, restaurante: cuenta.nombre, monto: p.monto, hasta: fin, url: cuenta.posUrl })
      .catch(e => console.error("[pos-cobro] correo pago:", e))
  }
  return { pago, hasta: fin, syncedRemote: lic.ok, syncError: lic.error }
}

/**
 * Cambia la licencia (suspensión, vencimiento, prueba) en el panel y la sincroniza con la instancia.
 */
export async function cambiarLicenciaPos(cuentaId: string, cambios: {
  suspendida?: boolean; fechaVencimiento?: Date; enPrueba?: boolean
}, operador: Operador, accion = "LICENCIA_SYNC") {
  const { cuenta, cliente } = await cuentaConCliente(cuentaId)
  const dataCliente: { suspendida?: boolean; fechaVencimiento?: Date } = {}
  if (cambios.suspendida !== undefined) dataCliente.suspendida = cambios.suspendida
  if (cambios.fechaVencimiento) dataCliente.fechaVencimiento = cambios.fechaVencimiento

  await prisma.$transaction([
    prisma.cliente.update({ where: { id: cliente.id }, data: dataCliente }),
    ...(cambios.enPrueba !== undefined ? [prisma.posCuenta.update({ where: { id: cuenta.id }, data: { enPrueba: cambios.enPrueba } })] : []),
  ])

  const remoto: Record<string, unknown> = {}
  if (cambios.suspendida !== undefined) remoto.suspendida = cambios.suspendida
  if (cambios.fechaVencimiento) remoto.fechaVencimiento = cambios.fechaVencimiento.toISOString()
  if (cambios.enPrueba !== undefined) remoto.enPrueba = cambios.enPrueba
  // Las instancias en instalación aún no responden: no se intenta sincronizar
  const res = cuenta.estadoAlta === "LISTO"
    ? await patchLicenciaRemota(cliente, remoto)
    : { ok: false, error: "La instancia aún no está instalada" }

  const det: string[] = []
  if (cambios.suspendida !== undefined) det.push(cambios.suspendida ? "Suspendida" : "Reactivada")
  if (cambios.fechaVencimiento) det.push(`Vence: ${fechaLarga(cambios.fechaVencimiento)}`)
  if (cambios.enPrueba !== undefined) det.push(cambios.enPrueba ? "En prueba" : "Cliente pagado")
  await logActividad({
    usuarioId: operador.id, usuarioNombre: operador.nombre, clienteId: cliente.id, clienteNombre: cliente.nombre,
    accion, detalle: `[Hypnos POS] ${det.join(" · ")}${res.ok ? "" : " · sin sincronizar"}`,
  })
  return { syncedRemote: res.ok, syncError: res.error }
}
