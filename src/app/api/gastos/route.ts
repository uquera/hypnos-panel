import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"

const UPLOAD_DIR   = path.join(process.cwd(), "uploads", "comprobantes")
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const CATEGORIAS_VALIDAS = ["HERRAMIENTA_IA", "SOFTWARE", "INFRAESTRUCTURA", "PUBLICIDAD", "OTRO"]

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")

  const gastos = await prisma.gasto.findMany({
    where: {
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + "T23:59:59Z") } : {}),
        },
      } : {}),
    },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: { fecha: "desc" },
  })

  return NextResponse.json({ gastos })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let registradoPorId = session.user.id
  if (!registradoPorId) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    registradoPorId = user.id
  }

  const formData  = await req.formData()
  const concepto  = (formData.get("concepto") as string)?.trim()
  const categoria = (formData.get("categoria") as string) || "OTRO"
  const monto     = parseFloat(formData.get("monto") as string)
  const moneda    = (formData.get("moneda") as string) || "USD"
  const fecha     = (formData.get("fecha") as string) || new Date().toISOString().split("T")[0]
  const notas     = (formData.get("notas") as string) || null
  const file      = formData.get("comprobante") as File | null

  if (!concepto) return NextResponse.json({ error: "El concepto es obligatorio" }, { status: 400 })
  if (isNaN(monto) || monto <= 0) return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  if (!CATEGORIAS_VALIDAS.includes(categoria)) return NextResponse.json({ error: "Categoría inválida" }, { status: 400 })

  let comprobante: string | null = null
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE)
      return NextResponse.json({ error: "El archivo supera el tamaño máximo de 10 MB" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ error: "Tipo no permitido. Use PDF, JPEG, PNG o WebP" }, { status: 400 })
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg")
    comprobante = `${randomUUID()}${ext}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, comprobante), Buffer.from(await file.arrayBuffer()))
  }

  const gasto = await prisma.gasto.create({
    data: { concepto, categoria, monto, moneda, fecha: new Date(fecha), notas, comprobante, registradoPorId },
    include: { registradoPor: { select: { nombre: true } } },
  })

  return NextResponse.json({ gasto }, { status: 201 })
}
