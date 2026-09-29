import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toUSD } from "@/lib/monedas"
import { enviarResumenFinanzas } from "@/lib/email"

// GET /api/cron/resumen-finanzas
// Llamado semanalmente por crontab (protegido por CRON_SECRET). Envía a los ADMIN
// un resumen de cuánto cargó cada persona en ingresos y gastos la última semana,
// para detectar rápido errores de clasificación (ej. un ingreso cargado como gasto).
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const hasta = new Date()
  const desde = new Date(hasta.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [pagos, gastos, admins] = await Promise.all([
    prisma.pago.findMany({
      where: { fechaPago: { gte: desde, lte: hasta } },
      include: { registradoPor: { select: { nombre: true } } },
    }),
    prisma.gasto.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      include: { registradoPor: { select: { nombre: true } } },
    }),
    prisma.user.findMany({ where: { role: "ADMIN", email: { not: undefined } }, select: { email: true } }),
  ])

  const to = admins.map(a => a.email).filter(Boolean)
  if (to.length === 0) return NextResponse.json({ ok: true, enviados: 0, motivo: "sin admins con email" })

  // Agregar por persona
  const map = new Map<string, { ingresos: number; gastos: number }>()
  const get = (n: string) => { if (!map.has(n)) map.set(n, { ingresos: 0, gastos: 0 }); return map.get(n)! }
  for (const p of pagos) get(p.registradoPor.nombre).ingresos += toUSD(p.monto, p.moneda)
  for (const g of gastos) get(g.registradoPor.nombre).gastos += toUSD(g.monto, g.moneda)

  const filas = [...map.entries()]
    .map(([persona, v]) => ({ persona, ingresos: Math.round(v.ingresos), gastos: Math.round(v.gastos) }))
    .sort((a, b) => (b.ingresos + b.gastos) - (a.ingresos + a.gastos))

  const totalIngresos = filas.reduce((s, f) => s + f.ingresos, 0)
  const totalGastos = filas.reduce((s, f) => s + f.gastos, 0)

  const fmt = (d: Date) => d.toLocaleDateString("es-CL", { day: "numeric", month: "short" })

  try {
    await enviarResumenFinanzas({ to, desde: fmt(desde), hasta: fmt(hasta), filas, totalIngresos, totalGastos })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, enviados: to.length, personas: filas.length })
}
