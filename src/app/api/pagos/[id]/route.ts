import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"
import { randomUUID } from "crypto"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
const CONCEPTOS_VALIDOS = ["LICENCIA", "MARKETING", "DESARROLLO"]

// PATCH /api/pagos/[id] — editar pago (solo ADMIN)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden editar ingresos" }, { status: 403 })

  const { id } = await params
  const pago = await prisma.pago.findUnique({ where: { id } })
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })

  const formData        = await req.formData()
  const monto           = parseFloat(formData.get("monto") as string)
  const moneda          = (formData.get("moneda") as string) || "USD"
  const concepto        = (formData.get("concepto") as string) || pago.concepto
  const conceptoDetalle = (formData.get("conceptoDetalle") as string) || null
  const periodoInicio   = formData.get("periodoInicio") as string | null
  const periodoFin      = formData.get("periodoFin")    as string | null
  const fechaPago       = formData.get("fechaPago")     as string
  const notas           = (formData.get("notas") as string) || null
  const file            = formData.get("comprobante") as File | null
  const custodiasRaw = formData.get("custodias") as string | null
  let custodias: { userId: string; monto: number }[] = []
  if (custodiasRaw) {
    try { custodias = JSON.parse(custodiasRaw) } catch { /* ignorar */ }
  }
  custodias = custodias.filter(c => c.monto > 0)

  if (isNaN(monto) || monto <= 0)
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  if (!fechaPago || isNaN(new Date(fechaPago).getTime()))
    return NextResponse.json({ error: "Fecha de pago inválida" }, { status: 400 })
  if (custodias.length > 0) {
    const suma = custodias.reduce((s, c) => s + c.monto, 0)
    if (Math.abs(suma - monto) > 0.01)
      return NextResponse.json({ error: "El reparto de custodia no cuadra con el monto del pago" }, { status: 400 })
    const existentes = await prisma.user.count({ where: { id: { in: custodias.map(c => c.userId) } } })
    if (existentes !== custodias.length)
      return NextResponse.json({ error: "Custodia con usuario inexistente" }, { status: 400 })
  }
  if (!CONCEPTOS_VALIDOS.includes(concepto))
    return NextResponse.json({ error: "Concepto inválido" }, { status: 400 })
  if (concepto === "LICENCIA" && (!periodoInicio || !periodoFin))
    return NextResponse.json({ error: "El período es obligatorio para pagos de licencia" }, { status: 400 })
  if (concepto !== "LICENCIA" && !conceptoDetalle?.trim())
    return NextResponse.json({ error: "El detalle del servicio es obligatorio" }, { status: 400 })

  let comprobante = pago.comprobante
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE)
      return NextResponse.json({ error: "El archivo supera el tamaño máximo de 10 MB" }, { status: 400 })
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ error: "Tipo no permitido. Use PDF, JPEG, PNG o WebP" }, { status: 400 })
    if (pago.comprobante) {
      try { await fs.unlink(path.join(UPLOAD_DIR, pago.comprobante)) } catch { /* ignorar */ }
    }
    const ext = path.extname(file.name) || (file.type === "application/pdf" ? ".pdf" : ".jpg")
    comprobante = `${randomUUID()}${ext}`
    await fs.mkdir(UPLOAD_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOAD_DIR, comprobante), Buffer.from(await file.arrayBuffer()))
  }

  const updated = await prisma.$transaction(async tx => {
    const pagoActualizado = await tx.pago.update({
      where: { id },
      data: {
        concepto,
        conceptoDetalle: conceptoDetalle?.trim() || null,
        monto,
        moneda,
        periodoInicio: concepto === "LICENCIA" && periodoInicio ? new Date(periodoInicio) : null,
        periodoFin:    concepto === "LICENCIA" && periodoFin    ? new Date(periodoFin)    : null,
        fechaPago:     new Date(fechaPago),
        notas:         notas || null,
        comprobante,
      },
      include: {
        registradoPor: { select: { nombre: true } },
      },
    })

    // Upsert custodias: borrar las viejas y crear las nuevas
    if (custodiasRaw !== null) {
      await tx.pagoCustodia.deleteMany({ where: { pagoId: id } })
      if (custodias.length > 0) {
        await tx.pagoCustodia.createMany({
          data: custodias.map(c => ({ pagoId: id, userId: c.userId, monto: c.monto })),
        })
      }
    }

    const custodiasFinal = await tx.pagoCustodia.findMany({
      where: { pagoId: id },
      include: { usuario: { select: { nombre: true } } },
    })
    return { ...pagoActualizado, custodias: custodiasFinal }
  })

  const userId   = session.user.id ?? ""
  const userName = session.user.name ?? session.user.email ?? "?"
  const cliente  = await prisma.cliente.findUnique({ where: { id: updated.clienteId }, select: { nombre: true } })
  const etiqueta = concepto === "MARKETING" ? "Marketing" : concepto === "DESARROLLO" ? "Desarrollo" : "Mensualidad"
  const custodiaResumen = updated.custodias.length > 0
    ? updated.custodias.map(c => `${c.usuario.nombre} $${c.monto}`).join(" / ")
    : updated.registradoPor.nombre
  await logActividad({
    usuarioId: userId, usuarioNombre: userName,
    clienteId: updated.clienteId, clienteNombre: cliente?.nombre,
    accion: "INGRESO_EDITADO",
    detalle: `[${etiqueta}] ${moneda} ${monto} · ${custodiaResumen}`,
  })

  return NextResponse.json({ pago: updated })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden eliminar ingresos" }, { status: 403 })

  const { id } = await params
  const pago = await prisma.pago.findUnique({ where: { id } })
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })

  if (pago.comprobante) {
    try { await fs.unlink(path.join(UPLOAD_DIR, pago.comprobante)) } catch { /* ignorar */ }
  }

  const clienteNombre = (await prisma.cliente.findUnique({ where: { id: pago.clienteId }, select: { nombre: true } }))?.nombre
  await prisma.pago.delete({ where: { id } })

  await logActividad({
    usuarioId: session.user.id ?? "", usuarioNombre: session.user.name ?? session.user.email ?? "?",
    clienteId: pago.clienteId, clienteNombre,
    accion: "INGRESO_ELIMINADO",
    detalle: `${pago.moneda} ${pago.monto} · ${pago.concepto}`,
  })

  return NextResponse.json({ ok: true })
}
