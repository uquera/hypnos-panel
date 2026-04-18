import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

// PATCH /api/pagos/[id] — editar pago (solo ADMIN)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores pueden editar pagos" }, { status: 403 })
  }

  const { id } = await params
  const pago = await prisma.pago.findUnique({ where: { id } })
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })

  const formData  = await req.formData()
  const monto     = parseFloat(formData.get("monto") as string)
  const moneda    = (formData.get("moneda") as string) || "CLP"
  const periodoInicio = formData.get("periodoInicio") as string
  const periodoFin    = formData.get("periodoFin") as string
  const fechaPago     = formData.get("fechaPago") as string
  const notas         = (formData.get("notas") as string) || null
  const file          = formData.get("comprobante") as File | null

  if (isNaN(monto) || monto <= 0 || !periodoInicio || !periodoFin || !fechaPago) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  let comprobante = pago.comprobante
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo supera el tamaño máximo de 10 MB" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Tipo no permitido. Use PDF, JPEG, PNG o WebP" }, { status: 400 })
    }
    // Eliminar archivo anterior
    if (pago.comprobante) {
      try { await fs.unlink(path.join(UPLOAD_DIR, pago.comprobante)) } catch { /* ignorar */ }
    }
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg")
    comprobante = `${randomUUID()}${ext}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, comprobante), Buffer.from(await file.arrayBuffer()))
  }

  const updated = await prisma.pago.update({
    where: { id },
    data: {
      monto,
      moneda,
      periodoInicio: new Date(periodoInicio),
      periodoFin:    new Date(periodoFin),
      fechaPago:     new Date(fechaPago),
      notas:         notas || null,
      comprobante,
    },
    include: { registradoPor: { select: { nombre: true } } },
  })

  return NextResponse.json({ pago: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores pueden eliminar pagos" }, { status: 403 })
  }

  const { id } = await params
  const pago = await prisma.pago.findUnique({ where: { id } })
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })

  if (pago.comprobante) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, pago.comprobante))
    } catch {
      // File might already be missing — continue
    }
  }

  await prisma.pago.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
