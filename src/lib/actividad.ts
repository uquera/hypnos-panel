import { prisma } from "@/lib/prisma"

interface LogData {
  usuarioId:     string
  usuarioNombre: string
  clienteId?:    string
  clienteNombre?: string
  accion:        string
  detalle?:      string
}

/**
 * Registra una entrada en el log de actividad.
 * Best-effort: si falla, no lanza excepción ni bloquea la operación principal.
 */
export async function logActividad(data: LogData): Promise<void> {
  try {
    await prisma.actividadLog.create({ data })
  } catch {
    // silently ignore — el log nunca debe romper la operación principal
  }
}
