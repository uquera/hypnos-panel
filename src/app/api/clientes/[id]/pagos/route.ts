import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const pagos = await prisma.pago.findMany({
    where: { clienteId: id },
    include: { registradoPor: { select: { nombre: true } } },
    orderBy: { fechaPago: "desc" },
  })

  return NextResponse.json({ pagos })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id: clienteId } = await params

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } })
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  // Resolve user ID (handle old sessions without id)
  let registradoPorId = session.user.id
  if (!registradoPorId) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    registradoPorId = user.id
  }

  const formData = await req.formData()
  const monto = parseFloat(formData.get("monto") as string)
  const moneda = (formData.get("moneda") as string) || "CLP"
  const periodoInicio = formData.get("periodoInicio") as string
  const periodoFin = formData.get("periodoFin") as string
  const fechaPago = formData.get("fechaPago") as string
  const notas = (formData.get("notas") as string) || null
  const file = formData.get("comprobante") as File | null

  if (isNaN(monto) || monto <= 0 || !periodoInicio || !periodoFin || !fechaPago) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  let comprobante: string | null = null
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo supera el tamaño máximo de 10 MB" }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo no permitido. Use PDF, JPEG, PNG o WebP" },
        { status: 400 }
      )
    }
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg")
    comprobante = `${randomUUID()}${ext}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(UPLOAD_DIR, comprobante), buffer)
  }

  const pago = await prisma.pago.create({
    data: {
      clienteId,
      monto,
      moneda,
      periodoInicio: new Date(periodoInicio),
      periodoFin: new Date(periodoFin),
      fechaPago: new Date(fechaPago),
      comprobante,
      notas,
      registradoPorId,
    },
    include: { registradoPor: { select: { nombre: true } } },
  })

  // Sincronizar pago al servidor del cliente (best-effort, no falla el request)
  let syncedRemote = false
  try {
    const pagosUrl = cliente.apiUrl.replace(/\/licencia$/, "/pagos")
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(pagosUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": cliente.masterKey,
      },
      body: JSON.stringify({ monto, moneda, periodoInicio, periodoFin, fechaPago, notas }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    syncedRemote = res.ok
  } catch {
    // Cliente caído o sin endpoint — no bloquea el registro local
  }

  return NextResponse.json({ pago, syncedRemote }, { status: 201 })
}
