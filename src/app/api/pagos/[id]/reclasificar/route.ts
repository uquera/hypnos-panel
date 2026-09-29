import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { NextResponse } from "next/server"

const CATEGORIAS = ["HERRAMIENTA_IA", "SOFTWARE", "INFRAESTRUCTURA", "PUBLICIDAD", "OTRO"]

// POST /api/pagos/[id]/reclasificar — convertir un INGRESO en gasto (solo ADMIN)
// Inverso de gastos/reclasificar: crea el Gasto con los mismos datos y elimina el
// pago (sus custodias cascadean), en transacción y con registro de auditoría.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores pueden reclasificar" }, { status: 403 })

  const { id } = await params
  const pago = await prisma.pago.findUnique({
    where: { id },
    include: { custodias: true, cliente: { select: { nombre: true } } },
  })
  if (!pago) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })

  const body = await req.json()
  const categoria = CATEGORIAS.includes(body.categoria) ? body.categoria : "OTRO"

  const custodioId = pago.custodioId ?? pago.custodias[0]?.userId ?? pago.registradoPorId
  const concepto =
    pago.conceptoDetalle?.trim() ||
    (pago.concepto === "LICENCIA" ? `Mensualidad ${pago.cliente.nombre}` : `${pago.concepto} ${pago.cliente.nombre}`)

  const gasto = await prisma.$transaction(async (tx) => {
    const creado = await tx.gasto.create({
      data: {
        concepto,
        categoria,
        monto:           pago.monto,
        moneda:          pago.moneda,
        fecha:           pago.fechaPago,
        comprobante:     pago.comprobante,
        notas:           pago.notas,
        registradoPorId: pago.registradoPorId,
        custodioId,
      },
    })
    await tx.pago.delete({ where: { id } }) // pago_custodias se eliminan en cascada
    return creado
  })

  await logActividad({
    usuarioId:     session.user.id ?? "",
    usuarioNombre: session.user.name ?? session.user.email ?? "?",
    clienteId:     pago.clienteId,
    clienteNombre: pago.cliente.nombre,
    accion:        "INGRESO_RECLASIFICADO",
    detalle:       `Ingreso ${pago.concepto} de ${pago.cliente.nombre} (${pago.moneda} ${pago.monto}) reclasificado como GASTO ${categoria}`,
  })

  return NextResponse.json({ ok: true, gastoId: gasto.id })
}
