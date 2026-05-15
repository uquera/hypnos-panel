import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"

const UPLOAD_DIR    = path.join(process.cwd(), "uploads", "comprobantes")
const MAX_FILE_SIZE  = 10 * 1024 * 1024
const ALLOWED_TYPES  = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const CATEGORIAS_VALIDAS = ["HERRAMIENTA_IA", "SOFTWARE", "INFRAESTRUCTURA", "PUBLICIDAD", "OTRO"]

// PATCH — editar (solo ADMIN)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  // Cualquier usuario autenticado puede editar gastos

  const { id } = await params
  const gasto  = await prisma.gasto.findUnique({ where: { id } })
  if (!gasto) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })

  const formData     = await req.formData()
  const concepto     = (formData.get("concepto") as string)?.trim()
  const categoria    = (formData.get("categoria") as string) || gasto.categoria
  const monto        = parseFloat(formData.get("monto") as string)
  const moneda       = (formData.get("moneda") as string) || gasto.moneda
  const fecha        = formData.get("fecha") as string
  const notas        = (formData.get("notas") as string) || null
  const file         = formData.get("comprobante") as File | null
  const custodioRaw  = formData.get("custodioId") as string | null
  const custodioId   = custodioRaw === null ? gasto.custodioId : (custodioRaw || null)

  if (!concepto) return NextResponse.json({ error: "El concepto es obligatorio" }, { status: 400 })
  if (isNaN(monto) || monto <= 0) return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  if (!CATEGORIAS_VALIDAS.includes(categoria)) return NextResponse.json({ error: "Categoría inválida" }, { status: 400 })

  let comprobante = gasto.comprobante
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Archivo supera 10 MB" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "Tipo no permitido" }, { status: 400 })
    if (gasto.comprobante) {
      try { await fs.unlink(path.join(UPLOAD_DIR, gasto.comprobante)) } catch { /* ignorar */ }
    }
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg")
    comprobante = `${randomUUID()}${ext}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, comprobante), Buffer.from(await file.arrayBuffer()))
  }

  const updated = await prisma.gasto.update({
    where: { id },
    data: { concepto, categoria, monto, moneda, fecha: new Date(fecha), notas, comprobante, custodioId },
    include: {
      registradoPor: { select: { nombre: true } },
      custodio:      { select: { nombre: true } },
    },
  })

  return NextResponse.json({ gasto: updated })
}

// DELETE — solo ADMIN
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  // Cualquier usuario autenticado puede eliminar gastos

  const { id }  = await params
  const gasto   = await prisma.gasto.findUnique({ where: { id } })
  if (!gasto) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })

  if (gasto.comprobante) {
    try { await fs.unlink(path.join(UPLOAD_DIR, gasto.comprobante)) } catch { /* ignorar */ }
  }

  await prisma.gasto.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
