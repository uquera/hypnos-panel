import { prisma } from "@/lib/prisma"
import { estadoPos, precioDe, ETIQUETA_ESTADO, type EstadoPos } from "./cobro"
import { claveDiaChile } from "./fechas"
import { urlLogo } from "./logo"
import { ALTA_ESTANCADA_MS } from "./alta"

// Datos del tablero /admin/pos (serializables para el cliente).

export const includeTablero = {
  cliente: { include: { pagos: { where: { concepto: "LICENCIA" }, orderBy: { fechaPago: "desc" as const }, take: 1 } } },
  usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" as const }, take: 1 },
  _count: { select: { comprobantes: { where: { estado: "PENDIENTE" } } } },
}

type CuentaTablero = NonNullable<Awaited<ReturnType<typeof cargarCuenta>>>
function cargarCuenta(id: string) {
  return prisma.posCuenta.findUnique({ where: { id }, include: includeTablero })
}

export function filaTablero(c: CuentaTablero) {
  const { estado, dias } = estadoPos(c)
  const ultimo = c.cliente?.pagos[0]
  const dueno = c.usuarios[0]
  const estancada = c.estadoAlta === "INSTALANDO" && !!c.altaAt && Date.now() - c.altaAt.getTime() > ALTA_ESTANCADA_MS
  return {
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    posUrl: c.posUrl,
    logoUrl: urlLogo("", c),
    colorPrimario: c.colorPrimario,
    dueno: dueno?.nombre ?? null,
    email: dueno?.email ?? c.cliente?.emailContacto ?? null,
    whatsapp: c.whatsapp,
    estado: estado as EstadoPos,
    etiqueta: estado === "EN_PRUEBA" && dias !== null ? `En prueba (${dias} día${dias === 1 ? "" : "s"})` : ETIQUETA_ESTADO[estado],
    dias,
    estadoAlta: c.estadoAlta,
    estancada,
    manual: c.estadoAlta === "MANUAL",
    enPrueba: c.enPrueba,
    suspendida: c.cliente?.suspendida ?? false,
    tieneLicencia: !!c.cliente,
    vence: c.cliente?.fechaVencimiento.toISOString() ?? null,
    venceDia: c.cliente ? claveDiaChile(c.cliente.fechaVencimiento) : null,
    ultimoPago: ultimo ? { fecha: ultimo.fechaPago.toISOString(), monto: ultimo.monto, moneda: ultimo.moneda } : null,
    pendientes: c._count.comprobantes,
    precio: precioDe(c),
    precioEspecial: c.precioMensual,
    origen: c.origen,
    createdAt: c.createdAt.toISOString(),
    eliminada: !!c.eliminadaAt,
  }
}

export type FilaTablero = ReturnType<typeof filaTablero>
