import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"

const CONCEPTOS = ["LICENCIA", "MARKETING", "DESARROLLO"]

// POST /api/gastos/[id]/reclasificar — convertir un gasto en INGRESO (solo ADMIN)
// Corrige el error de tipo (se cargó un ingreso como gasto) sin perder el registro
// ni el comprobante: crea el Pago con los mismos datos y elimina el gasto, en una
// transacción y dejando constancia en el log de auditoría.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden reclasificar" }, { status: 403 })

  const { id } = await params
  const gasto = await prisma.gasto.findUnique({ where: { id } })
  if (!gasto) return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 })

  const body = await req.json()
  const clienteId = (body.clienteId as string) || ""
  const concepto = CONCEPTOS.includes(body.concepto) ? body.concepto : null
  const conceptoDetalle = (body.conceptoDetalle as string)?.trim() || null

  if (!clienteId) return NextResponse.json({ error: "Selecciona el cliente del ingreso" }, { status: 400 })
  if (!concepto) return NextResponse.json({ error: "Selecciona la vertical del ingreso" }, { status: 400 })
  if (concepto !== "LICENCIA" && !conceptoDetalle)
    return NextResponse.json({ error: "El detalle del servicio es obligatorio" }, { status: 400 })

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } })
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })

  const custodioId = gasto.custodioId ?? gasto.registradoPorId

  // El archivo del comprobante NO se borra: lo hereda el nuevo Pago (misma carpeta).
  const pago = await prisma.$transaction(async (tx) => {
    const creado = await tx.pago.create({
      data: {
        clienteId,
        concepto,
        conceptoDetalle,
        monto:           gasto.monto,
        moneda:          gasto.moneda,
        fechaPago:       gasto.fecha,
        comprobante:     gasto.comprobante,
        notas:           gasto.notas,
        registradoPorId: gasto.registradoPorId,
        custodioId,
      },
    })
    await tx.pagoCustodia.create({ data: { pagoId: creado.id, userId: custodioId, monto: gasto.monto } })
    await tx.gasto.delete({ where: { id } })
    return creado
  })

  await logActividad({
    usuarioId:     session.user.id ?? "",
    usuarioNombre: session.user.name ?? session.user.email ?? "?",
    clienteId,
    clienteNombre: cliente.nombre,
    accion:        "GASTO_RECLASIFICADO",
    detalle:       `Gasto "${gasto.concepto}" (${gasto.moneda} ${gasto.monto}) reclasificado como INGRESO ${concepto}`,
  })

  return NextResponse.json({ ok: true, pagoId: pago.id })
}
