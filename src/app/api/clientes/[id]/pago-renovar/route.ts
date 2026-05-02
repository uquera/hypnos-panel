import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { randomUUID } from "crypto"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")
const ALLOWED    = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const MAX_SIZE   = 10 * 1024 * 1024

// POST /api/clientes/[id]/pago-renovar
// Registra el pago y renueva la licencia en una sola operación atómica.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const cliente = await prisma.cliente.findUnique({ where: { id } })
  if (!cliente || !cliente.activo)
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  const fd      = await req.formData()
  const monto   = Number(fd.get("monto"))
  const moneda  = (fd.get("moneda") as string) || "CLP"
  const periodoInicio = fd.get("periodoInicio") as string
  const periodoFin    = fd.get("periodoFin")    as string
  const fechaPago     = fd.get("fechaPago")     as string
  const notas         = (fd.get("notas") as string) || null
  const file          = fd.get("comprobante") as File | null

  if (!monto || monto <= 0 || !periodoInicio || !periodoFin || !fechaPago)
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 })

  // Guardar comprobante si viene
  let comprobante: string | null = null
  if (file && file.size > 0) {
    if (!ALLOWED.includes(file.type))
      return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 })
    if (file.size > MAX_SIZE)
      return NextResponse.json({ error: "Archivo demasiado grande (máx 10 MB)" }, { status: 400 })
    await mkdir(UPLOAD_DIR, { recursive: true })
    const ext = file.name.split(".").pop()
    const filename = `${randomUUID()}.${ext}`
    await writeFile(path.join(UPLOAD_DIR, filename), Buffer.from(await file.arrayBuffer()))
    comprobante = filename
  }

  // Obtener registradoPorId
  let registradoPorId = session.user.id
  if (!registradoPorId) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    registradoPorId = user.id
  }

  // Calcular nueva fecha de vencimiento (+30 días desde vencimiento o desde hoy)
  const base = new Date(cliente.fechaVencimiento) > new Date()
    ? new Date(cliente.fechaVencimiento)
    : new Date()
  const nuevaFecha = new Date(base)
  nuevaFecha.setDate(nuevaFecha.getDate() + 30)
  const nuevaFechaStr = nuevaFecha.toISOString().split("T")[0]

  // Operación atómica: crear pago + renovar licencia
  const [pago] = await prisma.$transaction([
    prisma.pago.create({
      data: {
        clienteId:      id,
        monto,
        moneda,
        periodoInicio:  new Date(periodoInicio),
        periodoFin:     new Date(periodoFin),
        fechaPago:      new Date(fechaPago),
        comprobante,
        notas,
        registradoPorId,
      },
    }),
    prisma.cliente.update({
      where: { id },
      data:  { fechaVencimiento: nuevaFecha, suspendida: false },
    }),
  ])

  // Sincronizar con el cliente (best-effort)
  let syncedRemote = false
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10_000)

    // Sync licencia
    const resLic = await fetch(cliente.apiUrl, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "X-Master-Key": cliente.masterKey },
      body:    JSON.stringify({ fechaVencimiento: nuevaFechaStr, suspendida: false }),
      signal:  controller.signal,
    })

    // Sync pago
    const pagosUrl = cliente.apiUrl.replace(/\/licencia$/, "/pagos")
    await fetch(pagosUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Master-Key": cliente.masterKey },
      body:    JSON.stringify({ monto, moneda, periodoInicio, periodoFin, fechaPago }),
      signal:  controller.signal,
    })

    syncedRemote = resLic.ok
  } catch { /* cliente caído */ }

  // Log de actividad
  await logActividad({
    usuarioId:     registradoPorId,
    usuarioNombre: session.user.name ?? "Usuario",
    clienteId:     id,
    clienteNombre: cliente.nombre,
    accion:        "PAGO_REGISTRADO",
    detalle:       `${moneda} $${monto.toLocaleString()} + renovación hasta ${nuevaFechaStr}`,
  })

  return NextResponse.json({ ok: true, pago, nuevaFecha: nuevaFechaStr, syncedRemote })
}
