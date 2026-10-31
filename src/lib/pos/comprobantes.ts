import fs from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { ErrorPos } from "./usuarios"
import { basePublica } from "./servidor"
import { registrarPagoPos, correoCobroDe, precioDe } from "./cobro"
import { avisoHypnosComprobante, correoComprobanteRechazado } from "./correos"

// Comprobantes de transferencia de Hypnos POS. Se guardan FUERA de public, en
// POS_COMPROBANTES_DIR (por defecto <cwd>/uploads/pos-comprobantes), y solo se sirven
// por /api/pos-comprobantes/<id> a Hypnos (ADMIN) o al negocio dueño del comprobante.

export const COMPROBANTE_MAX_BYTES = 8 * 1024 * 1024

export function dirComprobantes(): string {
  return process.env.POS_COMPROBANTES_DIR || path.join(process.cwd(), "uploads", "pos-comprobantes")
}

const TIPOS = {
  "image/jpeg":      "jpg",
  "image/png":       "png",
  "image/webp":      "webp",
  "application/pdf": "pdf",
} as const
type Mime = keyof typeof TIPOS

/** Tipo real por los primeros bytes (no se confía en el nombre ni en el Content-Type). */
export function tipoReal(buf: Buffer): Mime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp"
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf"
  return null
}

export async function subirComprobante(p: {
  cuentaId: string; archivo: File; montoDeclarado: number; comentario?: string; subidoPor: string
}) {
  const cuenta = await prisma.posCuenta.findUnique({ where: { id: p.cuentaId }, select: { id: true, nombre: true, clienteId: true } })
  if (!cuenta) throw new ErrorPos("Cuenta no encontrada.", 404)
  if (!cuenta.clienteId) throw new ErrorPos("Tu cuenta aún no tiene un plan asociado. Escríbenos a contacto@hypnosapps.com.")
  if (!(p.archivo instanceof File) || p.archivo.size === 0) throw new ErrorPos("Adjunta el comprobante (imagen o PDF).")
  if (p.archivo.size > COMPROBANTE_MAX_BYTES) throw new ErrorPos("El archivo pesa más de 8 MB.")
  if (!(p.montoDeclarado > 0) || p.montoDeclarado > 10_000_000) throw new ErrorPos("Escribe el monto que transferiste.")

  const buf  = Buffer.from(await p.archivo.arrayBuffer())
  const mime = tipoReal(buf)
  if (!mime) throw new ErrorPos("El comprobante debe ser una imagen (JPG, PNG, WebP) o un PDF.")

  const dir = dirComprobantes()
  await fs.mkdir(dir, { recursive: true })
  const archivo = `${randomUUID()}.${TIPOS[mime]}`
  await fs.writeFile(path.join(dir, archivo), buf)

  const comp = await prisma.posComprobante.create({
    data: {
      cuentaId: cuenta.id, archivo, mime,
      nombreOriginal: p.archivo.name.slice(0, 120),
      montoDeclarado: Math.round(p.montoDeclarado),
      comentario: p.comentario?.trim().slice(0, 500) || null,
      subidoPor: p.subidoPor,
    },
  })

  await avisoHypnosComprobante({
    restaurante: cuenta.nombre, monto: comp.montoDeclarado, subidoPor: p.subidoPor,
    linkFicha: `${basePublica()}/admin/pos/${cuenta.id}#comprobantes`,
  }).catch(e => console.error("[pos-comprobante] aviso:", e))
  return comp
}

export async function leerArchivoComprobante(archivo: string): Promise<Buffer | null> {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(archivo)) return null
  try {
    return await fs.readFile(path.join(dirComprobantes(), archivo))
  } catch {
    return null
  }
}

/** Copia el archivo a uploads/comprobantes para que se vea en Ingresos (best-effort). */
async function copiarAIngresos(archivo: string): Promise<string | null> {
  try {
    const destino = path.join(process.cwd(), "uploads", "comprobantes")
    await fs.mkdir(destino, { recursive: true })
    await fs.copyFile(path.join(dirComprobantes(), archivo), path.join(destino, archivo))
    return archivo
  } catch {
    return null
  }
}

interface Operador { id: string; nombre: string }

async function pendiente(id: string) {
  const comp = await prisma.posComprobante.findUnique({ where: { id }, include: { cuenta: true } })
  if (!comp) throw new ErrorPos("Comprobante no encontrado.", 404)
  if (comp.estado !== "PENDIENTE") throw new ErrorPos("Ese comprobante ya fue revisado.", 409)
  return comp
}

export async function aprobarComprobante(id: string, operador: Operador, monto?: number, meses?: number) {
  const comp = await pendiente(id)
  // Marca primero (evita doble aprobación por doble clic)
  const tomado = await prisma.posComprobante.updateMany({
    where: { id, estado: "PENDIENTE" },
    data:  { estado: "APROBADO", revisadoPor: operador.nombre, revisadoAt: new Date() },
  })
  if (tomado.count === 0) throw new ErrorPos("Ese comprobante ya fue revisado.", 409)

  try {
    const r = await registrarPagoPos({
      cuentaId: comp.cuentaId,
      monto: monto && monto > 0 ? monto : comp.montoDeclarado || precioDe(comp.cuenta),
      meses,
      comprobante: await copiarAIngresos(comp.archivo),
      notas: `Hypnos POS · comprobante subido por ${comp.subidoPor || "el negocio"}`,
      operador,
    })
    await prisma.posComprobante.update({ where: { id }, data: { pagoId: r.pago.id } })
    return r
  } catch (e) {
    await prisma.posComprobante.update({ where: { id }, data: { estado: "PENDIENTE", revisadoPor: null, revisadoAt: null } })
    throw e
  }
}

export async function rechazarComprobante(id: string, motivo: string, operador: Operador) {
  const m = motivo.trim().slice(0, 500)
  if (m.length < 3) throw new ErrorPos("Escribe el motivo del rechazo.")
  const comp = await pendiente(id)
  await prisma.posComprobante.update({
    where: { id },
    data:  { estado: "RECHAZADO", motivoRechazo: m, revisadoPor: operador.nombre, revisadoAt: new Date() },
  })
  await logActividad({
    usuarioId: operador.id, usuarioNombre: operador.nombre, clienteId: comp.cuenta.clienteId ?? undefined,
    clienteNombre: comp.cuenta.nombre, accion: "POS_COMPROBANTE_RECHAZADO", detalle: m,
  })
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: comp.cuentaId },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
  })
  const to = cuenta ? correoCobroDe(cuenta) : null
  if (to) {
    await correoComprobanteRechazado({ to, restaurante: comp.cuenta.nombre, motivo: m, linkPago: `${basePublica()}/pos/pago` })
      .catch(e => console.error("[pos-comprobante] correo rechazo:", e))
  }
}
