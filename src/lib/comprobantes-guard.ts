// Puerta de entrada de los comprobantes de gasto: junta las tres preguntas
// que se le hacen a un archivo adjunto antes de aceptarlo.
//
//   1. ¿Es un documento? (tipo real del archivo y tamaño legible)
//   2. ¿Parece un comprobante de pago? (texto del PDF u OCR, señales)
//   3. ¿Ya está usado en otro gasto? (el mismo archivo subido dos veces)
//
// Devuelve un veredicto y, cuando corresponde, el texto exacto que ve el
// usuario. Solo "invalido" no tiene salida; el resto se puede confirmar y el
// gasto queda marcado como comprobante sin verificar.

import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { extraerTexto, type MotorTexto } from "@/lib/comprobante-texto"
import {
  revisarArchivo, revisarTexto, resumenSenales,
  type RevisionTexto, type Senal, type TipoArchivo,
} from "@/lib/comprobantes"

export interface RegistroConMismoArchivo {
  tipo:     "gasto" | "ingreso"
  id:       string
  concepto: string
  monto:    number
  moneda:   string
  fecha:    string
}

/** @deprecated nombre anterior, cuando solo se revisaban gastos */
export type GastoConMismoArchivo = RegistroConMismoArchivo

export type VeredictoComprobante = "ok" | "debil" | "ilegible" | "recorte" | "invalido"

export interface ResultadoComprobante {
  veredicto: VeredictoComprobante
  /** Frase principal para el usuario. null solo cuando todo está bien. */
  motivo:    string | null
  faltan:    string[]
  senales:   Senal[]
  motor:     MotorTexto
  tipo:      TipoArchivo | null
  hash:      string
  repetido:  RegistroConMismoArchivo | null
  /** Resumen corto que se guarda en el gasto y se muestra en la lista. */
  nota:      string
  /** true cuando el comprobante se puede dar por verificado sin preguntar. */
  limpio:    boolean
}

function motivoDeTexto(rev: RevisionTexto, motor: MotorTexto, tipo: TipoArchivo): string {
  if (motor === "no-disponible") return "No se pudo leer el documento en este servidor, así que no alcanzamos a verificar que sea un comprobante."
  if (rev.veredicto === "ilegible") {
    return tipo === "pdf"
      ? "El PDF no tiene texto legible: puede estar escaneado, vacío o cortado."
      : "No se pudo leer nada de la imagen: puede estar borrosa o no tener texto."
  }
  return "El documento no se ve como un comprobante de pago."
}

export async function revisarComprobante(
  buf: Buffer,
  nombreOriginal: string,
  ctx: { concepto: string; monto: number; moneda: string; fecha: Date; ambito?: "gasto" | "ingreso" },
  excluir: { gastoId?: string; pagoId?: string } = {},
): Promise<ResultadoComprobante> {
  const hash = createHash("sha256").update(buf).digest("hex")
  const base = {
    faltan: [] as string[], senales: [] as Senal[], motor: "error" as MotorTexto,
    hash, repetido: null as RegistroConMismoArchivo | null,
  }

  const archivo = revisarArchivo(buf, nombreOriginal)
  if (archivo.invalido) {
    return { ...base, veredicto: "invalido", motivo: archivo.invalido, tipo: archivo.tipo, nota: "archivo inválido", limpio: false }
  }

  // El mismo archivo ya adjunto a otro movimiento: casi siempre es el comprobante
  // de un mes reciclado para justificar otro. Se busca en gastos y en ingresos,
  // porque reusarlo de un lado al otro es igual de sospechoso.
  const [otroGasto, otroPago] = await Promise.all([
    prisma.gasto.findFirst({
      where: { comprobanteHash: hash, ...(excluir.gastoId ? { id: { not: excluir.gastoId } } : {}) },
      select: { id: true, concepto: true, monto: true, moneda: true, fecha: true },
      orderBy: { fecha: "desc" },
    }),
    prisma.pago.findFirst({
      where: { comprobanteHash: hash, ...(excluir.pagoId ? { id: { not: excluir.pagoId } } : {}) },
      select: { id: true, monto: true, moneda: true, fechaPago: true, cliente: { select: { nombre: true } } },
      orderBy: { fechaPago: "desc" },
    }),
  ])
  const repetido: RegistroConMismoArchivo | null =
    otroGasto ? { tipo: "gasto", id: otroGasto.id, concepto: otroGasto.concepto, monto: otroGasto.monto, moneda: otroGasto.moneda, fecha: otroGasto.fecha.toISOString() }
    : otroPago ? { tipo: "ingreso", id: otroPago.id, concepto: otroPago.cliente.nombre, monto: otroPago.monto, moneda: otroPago.moneda, fecha: otroPago.fechaPago.toISOString() }
    : null

  if (archivo.recorte) {
    return { ...base, repetido, veredicto: "recorte", motivo: archivo.recorte, tipo: archivo.tipo, nota: "recorte de pantalla", limpio: false }
  }

  const { texto, motor } = await extraerTexto(buf, archivo.tipo!)
  const rev = revisarTexto(texto, ctx)
  const resumen = resumenSenales(rev)

  if (repetido) {
    const fecha = new Date(repetido.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "long", timeZone: "UTC" })
    return {
      ...base, motor, tipo: archivo.tipo, repetido, senales: rev.senales, faltan: rev.faltan,
      veredicto: rev.veredicto === "ok" ? "ok" : rev.veredicto,
      motivo: `Este mismo archivo ya está adjunto en el ${repetido.tipo} "${repetido.concepto}" del ${fecha} (${repetido.moneda} ${repetido.monto}).`,
      nota: `archivo repetido · ${resumen}`,
      limpio: false,
    }
  }

  if (rev.veredicto === "ok") {
    return { ...base, motor, tipo: archivo.tipo, repetido, senales: rev.senales, faltan: [], veredicto: "ok", motivo: null, nota: `verificado · ${resumen}`, limpio: true }
  }

  return {
    ...base, motor, tipo: archivo.tipo, repetido, senales: rev.senales, faltan: rev.faltan,
    veredicto: rev.veredicto,
    motivo: motivoDeTexto(rev, motor, archivo.tipo!),
    nota: rev.veredicto === "ilegible" ? "no se pudo leer el documento" : `débil · falta ${rev.faltan.slice(0, 2).join(" y ")}`,
    limpio: false,
  }
}

// Lo que se le muestra al usuario cuando el comprobante no convence.
export function mensajeComprobante(r: ResultadoComprobante): string {
  const partes = [r.motivo ?? "El comprobante no se pudo verificar."]
  if (r.faltan.length > 0 && r.veredicto === "debil") partes.push(`No encontramos ${r.faltan.join(", ni ")}.`)
  return partes.join(" ")
}
