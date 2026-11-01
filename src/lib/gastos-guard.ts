import { prisma } from "@/lib/prisma"
import { buscarSimilares } from "@/lib/duplicados"

export interface DuplicadoAviso {
  id:       string
  concepto: string
  notas:    string | null
  monto:    number
  moneda:   string
  fecha:    string
  quien:    string
  mismoMonto: boolean
}

// Busca en el MISMO MES otro gasto que parezca ser este mismo. Devuelve null
// si no hay nada parecido. El llamador decide: avisar y dejar confirmar
// (crear/editar) o rechazar.
export async function buscarDuplicadosDelMes(
  nuevo: { concepto: string; notas?: string | null; monto: number; moneda: string; fecha: Date },
  excluirId?: string,
): Promise<DuplicadoAviso[]> {
  const inicio = new Date(Date.UTC(nuevo.fecha.getUTCFullYear(), nuevo.fecha.getUTCMonth(), 1))
  const fin    = new Date(Date.UTC(nuevo.fecha.getUTCFullYear(), nuevo.fecha.getUTCMonth() + 1, 1))

  const delMes = await prisma.gasto.findMany({
    where: { fecha: { gte: inicio, lt: fin }, ...(excluirId ? { id: { not: excluirId } } : {}) },
    include: {
      registradoPor: { select: { nombre: true } },
      custodio:      { select: { nombre: true } },
    },
  })

  const comparables = delMes.map(g => ({
    id:       g.id,
    concepto: g.concepto,
    notas:    g.notas,
    monto:    g.monto,
    moneda:   g.moneda,
    fecha:    g.fecha,
    quien:    g.custodio?.nombre ?? g.registradoPor.nombre,
  }))

  return buscarSimilares(nuevo, comparables).map(s => ({
    id:         s.gasto.id,
    concepto:   s.gasto.concepto,
    notas:      s.gasto.notas ?? null,
    monto:      s.gasto.monto,
    moneda:     s.gasto.moneda,
    fecha:      (s.gasto.fecha as Date).toISOString(),
    quien:      s.gasto.quien ?? "",
    mismoMonto: s.mismoMonto,
  }))
}

export function mensajeDuplicado(dups: DuplicadoAviso[]): string {
  const d = dups[0]
  const fecha = new Date(d.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "long", timeZone: "UTC" })
  return `Ya hay un gasto parecido este mes: "${d.concepto}" del ${fecha} por ${d.moneda} ${d.monto} (${d.quien}).`
}
