import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

const MONEDAS_VALIDAS = ["USD", "CLP", "EUR"]

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")
  const isAdmin = session.user.role === "ADMIN"

  const retiros = await prisma.retiro.findMany({
    where: {
      // COBRADOR solo ve sus propios retiros
      ...(!isAdmin ? { registradoPorId: session.user.id! } : {}),
      ...(desde || hasta ? {
        fecha: {
          ...(desde ? { gte: new Date(desde) } : {}),
          ...(hasta ? { lte: new Date(hasta + "T23:59:59Z") } : {}),
        },
      } : {}),
    },
    include: { registradoPor: { select: { id: true, nombre: true } } },
    orderBy: { fecha: "desc" },
  })

  return NextResponse.json({ retiros })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const isAdmin = session.user.role === "ADMIN"

  // Resolver el ID del usuario actual (pueden estar en session o hay que buscarlo)
  let selfId = session.user.id
  if (!selfId) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email! } })
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    selfId = user.id
  }

  const body = await req.json()
  const { monto, moneda = "USD", fecha, concepto, usuarioId } = body

  if (isNaN(parseFloat(monto)) || parseFloat(monto) <= 0)
    return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
  if (!MONEDAS_VALIDAS.includes(moneda))
    return NextResponse.json({ error: "Moneda inválida" }, { status: 400 })

  // Solo ADMIN puede registrar retiro de otro usuario
  let registradoPorId = selfId
  if (usuarioId && usuarioId !== selfId) {
    if (!isAdmin)
      return NextResponse.json({ error: "Solo ADMIN puede registrar retiros de otro usuario" }, { status: 403 })
    const target = await prisma.user.findUnique({ where: { id: usuarioId } })
    if (!target) return NextResponse.json({ error: "Usuario destino no encontrado" }, { status: 404 })
    registradoPorId = usuarioId
  }

  const retiro = await prisma.retiro.create({
    data: {
      monto: parseFloat(monto),
      moneda,
      fecha: fecha ? new Date(fecha) : new Date(),
      concepto: concepto?.trim() || null,
      registradoPorId,
    },
    include: { registradoPor: { select: { id: true, nombre: true } } },
  })

  await prisma.actividadLog.create({
    data: {
      usuarioId: selfId,
      usuarioNombre: session.user.name ?? session.user.email ?? "?",
      accion: "RETIRO_REGISTRADO",
      detalle: `Retiro de ${moneda} ${parseFloat(monto).toFixed(2)} para ${retiro.registradoPor.nombre}${concepto ? ` — ${concepto}` : ""}`,
    },
  })

  return NextResponse.json({ retiro }, { status: 201 })
}
