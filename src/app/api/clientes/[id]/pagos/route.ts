import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const CONCEPTOS_VALIDOS = ["LICENCIA", "MARKETING", "DESARROLLO"]

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const pagos = await prisma.pago.findMany({
    where: { clienteId: id },
    include: {
      registradoPor: { select: { nombre: true } },
      custodio:      { select: { nombre: true } },
    },
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

  let registradoPorId = session.user.id
  if (!registradoPorId) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    registradoPorId = user.id
  }

  const formData        = await req.formData()
  const monto           = parseFloat(formData.get("monto") as string)
  const moneda          = (formData.get("moneda") as string) || "USD"
  const concepto        = (formData.get("concepto") as string) || "LICENCIA"
  const conceptoDetalle = (formData.get("conceptoDetalle") as string) || null
  const periodoInicio   = formData.get("periodoInicio") as string | null
  const periodoFin      = formData.get("periodoFin")    as string | null
  const fechaPago       = formData.get("fechaPago")     as string
  const notas           = (formData.get("notas") as string) || null
  const file            = formData.get("comprobante") as File | null
  // custodias: JSON array de {userId, monto} para split de custodia
  const custodiasRaw = (formData.get("custodias") as string) || null
  let custodias: { userId: string; monto: number }[] = []
  if (custodiasRaw) {
    try { custodias = JSON.parse(custodiasRaw) } catch { /* ignorar */ }
  }
  custodias = custodias.filter(c => c.monto > 0)

  if (isNaN(monto) || monto <= 0) {
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  }
  if (!fechaPago || isNaN(new Date(fechaPago).getTime())) {
    return NextResponse.json({ error: "Fecha de pago inválida" }, { status: 400 })
  }
  if (custodias.length > 0) {
    const suma = custodias.reduce((s, c) => s + c.monto, 0)
    if (Math.abs(suma - monto) > 0.01)
      return NextResponse.json({ error: "El reparto de custodia no cuadra con el monto del pago" }, { status: 400 })
    const existentes = await prisma.user.count({ where: { id: { in: custodias.map(c => c.userId) } } })
    if (existentes !== custodias.length)
      return NextResponse.json({ error: "Custodia con usuario inexistente" }, { status: 400 })
  }
  if (!CONCEPTOS_VALIDOS.includes(concepto)) {
    return NextResponse.json({ error: "Concepto inválido" }, { status: 400 })
  }
  if (concepto === "LICENCIA" && (!periodoInicio || !periodoFin)) {
    return NextResponse.json({ error: "El período es obligatorio para pagos de licencia" }, { status: 400 })
  }
  if (concepto !== "LICENCIA" && !conceptoDetalle?.trim()) {
    return NextResponse.json({ error: "El detalle del servicio es obligatorio" }, { status: 400 })
  }

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

  const pago = await prisma.$transaction(async tx => {
    const creado = await tx.pago.create({
      data: {
        clienteId,
        concepto,
        conceptoDetalle: conceptoDetalle?.trim() || null,
        monto,
        moneda,
        periodoInicio: concepto === "LICENCIA" && periodoInicio ? new Date(periodoInicio) : null,
        periodoFin:    concepto === "LICENCIA" && periodoFin    ? new Date(periodoFin)    : null,
        fechaPago:     new Date(fechaPago),
        comprobante,
        notas,
        registradoPorId,
      },
      include: {
        registradoPor: { select: { nombre: true } },
      },
    })

    // Crear registros de custodia split
    if (custodias.length > 0) {
      await tx.pagoCustodia.createMany({
        data: custodias.map(c => ({ pagoId: creado.id, userId: c.userId, monto: c.monto })),
      })
    }

    const custodiasFinal = await tx.pagoCustodia.findMany({
      where: { pagoId: creado.id },
      include: { usuario: { select: { nombre: true } } },
    })
    return { ...creado, custodias: custodiasFinal }
  })

  // Etiqueta para el log de actividad
  const etiquetaConcepto =
    concepto === "MARKETING" ? "Marketing" :
    concepto === "DESARROLLO" ? "Desarrollo" : "Mensualidad"

  const detallePeriodo =
    concepto === "LICENCIA" && periodoInicio
      ? new Date(periodoInicio).toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
      : conceptoDetalle?.trim() ?? ""

  await logActividad({
    usuarioId:     registradoPorId,
    usuarioNombre: session.user.name ?? "Usuario",
    clienteId,
    clienteNombre: cliente.nombre,
    accion:        "PAGO_REGISTRADO",
    detalle: `[${etiquetaConcepto}] ${new Intl.NumberFormat("es-CL", {
      style: "currency", currency: moneda, maximumFractionDigits: moneda === "CLP" ? 0 : 2,
    }).format(monto)} · ${detallePeriodo}`,
  })

  // Sincronizar al cliente remoto solo para pagos de licencia
  let syncedRemote = false
  if (concepto === "LICENCIA") {
    try {
      const pagosUrl = cliente.apiUrl.replace(/\/licencia$/, "/pagos")
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(pagosUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Master-Key": cliente.masterKey },
        body: JSON.stringify({ monto, moneda, periodoInicio, periodoFin, fechaPago, notas }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      syncedRemote = res.ok
    } catch { /* cliente caído — no bloquea */ }
  }

  return NextResponse.json({ pago, syncedRemote }, { status: 201 })
}
