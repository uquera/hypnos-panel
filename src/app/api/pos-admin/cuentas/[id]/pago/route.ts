import fs from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar, operadorDe } from "@/lib/pos/api"
import { ErrorPos } from "@/lib/pos/usuarios"
import { registrarPagoPos, precioDe } from "@/lib/pos/cobro"
import { finDelDiaChile } from "@/lib/pos/fechas"
import { tipoReal, COMPROBANTE_MAX_BYTES } from "@/lib/pos/comprobantes"
import { prisma } from "@/lib/prisma"

// POST /api/pos-admin/cuentas/:id/pago — registra el cobro mensual de un restaurante
// como un ingreso del estándar de Hypnos (solo ADMIN). Multipart, porque lleva archivo:
//   monto, meses, fechaPago (YYYY-MM-DD), notas
//   comprobante  archivo (JPG/PNG/WebP/PDF, ≤8 MB) — se guarda en uploads/comprobantes
//   custodias    JSON [{userId, monto}] — debe sumar el monto; vacío = custodio el operador
// Extiende la licencia y la sincroniza con la instancia (lo hace registrarPagoPos).

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params

  return manejar(async () => {
    const operador = await operadorDe(session)
    const cuenta = await prisma.posCuenta.findUnique({ where: { id }, select: { id: true, eliminadaAt: true, precioMensual: true } })
    if (!cuenta) throw new ErrorPos("Cuenta no encontrada.", 404)
    if (cuenta.eliminadaAt) throw new ErrorPos("La cuenta está eliminada.")

    const fd = await req.formData()
    const monto = Number(String(fd.get("monto") ?? "").replace(/[^\d]/g, "")) || precioDe(cuenta)
    if (!(monto > 0) || monto > 10_000_000) throw new ErrorPos("Monto no válido.")

    const meses = Number(fd.get("meses")) || 1
    const fechaTxt = String(fd.get("fechaPago") ?? "")
    const fecha = fechaTxt ? finDelDiaChile(fechaTxt) : null
    if (fechaTxt && !fecha) throw new ErrorPos("Fecha de pago no válida.")
    // Una fecha futura dejaría el ingreso fuera del mes que corresponde
    if (fecha && fecha.getTime() > Date.now() + 86_400_000) throw new ErrorPos("La fecha de pago no puede ser futura.")

    let custodias: { userId: string; monto: number }[] = []
    const custodiasRaw = String(fd.get("custodias") ?? "")
    if (custodiasRaw) {
      try { custodias = JSON.parse(custodiasRaw) } catch { throw new ErrorPos("Reparto de custodia no válido.") }
    }

    // Comprobante: se exige tipo real por los primeros bytes, no por el nombre ni el Content-Type
    let comprobante: string | null = null
    const archivo = fd.get("comprobante")
    if (archivo instanceof File && archivo.size > 0) {
      if (archivo.size > COMPROBANTE_MAX_BYTES) throw new ErrorPos("El comprobante pesa más de 8 MB.")
      const buf  = Buffer.from(await archivo.arrayBuffer())
      const mime = tipoReal(buf)
      if (!mime) throw new ErrorPos("El comprobante debe ser una imagen (JPG, PNG, WebP) o un PDF.")
      comprobante = `${randomUUID()}.${EXT[mime]}`
      await fs.mkdir(UPLOAD_DIR, { recursive: true })
      await fs.writeFile(path.join(UPLOAD_DIR, comprobante), buf)
    }

    try {
      const r = await registrarPagoPos({
        cuentaId: id, monto, meses, fechaPago: fecha ?? new Date(),
        notas: String(fd.get("notas") ?? "").trim().slice(0, 300) || "Hypnos POS · pago registrado por Hypnos",
        comprobante, custodias, operador,
      })
      return NextResponse.json({
        ok: true, hasta: r.hasta.toISOString(), pagoId: r.pago.id,
        syncedRemote: r.syncedRemote, syncError: r.syncError,
      })
    } catch (e) {
      // El pago no quedó: no dejar el archivo huérfano en Ingresos
      if (comprobante) await fs.unlink(path.join(UPLOAD_DIR, comprobante)).catch(() => {})
      throw e
    }
  })
}
