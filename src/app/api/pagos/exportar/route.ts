import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const clienteId = searchParams.get("clienteId")
  const desde     = searchParams.get("desde")
  const hasta     = searchParams.get("hasta")

  const where: Record<string, unknown> = {}
  if (clienteId) where.clienteId = clienteId
  if (desde || hasta) {
    where.fechaPago = {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta + "T23:59:59Z") } : {}),
    }
  }

  const pagos = await prisma.pago.findMany({
    where,
    include: {
      cliente:       { select: { nombre: true, dominio: true } },
      registradoPor: { select: { nombre: true } },
    },
    orderBy: { fechaPago: "desc" },
  })

  function fmt(iso: Date) {
    return iso.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  }

  function esc(v: string | null | undefined) {
    if (!v) return ""
    return `"${v.replace(/"/g, '""')}"`
  }

  const header = "Fecha pago,Cliente,Dominio,Período inicio,Período fin,Monto,Moneda,Notas,Registrado por"
  const rows   = pagos.map(p =>
    [
      fmt(p.fechaPago),
      esc(p.cliente.nombre),
      esc(p.cliente.dominio),
      fmt(p.periodoInicio),
      fmt(p.periodoFin),
      p.monto,
      p.moneda,
      esc(p.notas),
      esc(p.registradoPor.nombre),
    ].join(",")
  )

  const csv      = [header, ...rows].join("\n")
  const filename = `pagos-hypnos-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
