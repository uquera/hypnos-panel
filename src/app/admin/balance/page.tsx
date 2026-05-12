import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import BalanceClient from "./BalanceClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Balance — Hypnos Panel" }

function toUSD(monto: number, moneda: string) {
  if (moneda === "USD") return monto
  if (moneda === "CLP") return monto / 1000
  return monto
}

export default async function BalancePage() {
  const session = await auth()
  if (!session) redirect("/login")

  const hoy = new Date()

  // Traer últimos 12 meses de pagos y gastos
  const hace12Meses = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)

  const [pagos, gastos] = await Promise.all([
    prisma.pago.findMany({
      where:  { fechaPago: { gte: hace12Meses } },
      select: { fechaPago: true, monto: true, moneda: true, concepto: true },
    }),
    prisma.gasto.findMany({
      where:  { fecha: { gte: hace12Meses } },
      select: { fecha: true, monto: true, moneda: true, categoria: true },
    }),
  ])

  // Construir tabla mensual
  type MesData = {
    key: string
    label: string
    ingresos: number
    gastos: number
    margen: number
    pct: number | null
    // breakdown ingresos
    licencia: number
    marketing: number
    desarrollo: number
  }

  const meses: MesData[] = []

  for (let i = 11; i >= 0; i--) {
    const d     = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const y     = d.getFullYear()
    const m     = d.getMonth()
    const key   = `${y}-${String(m + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })

    const pagosMes  = pagos.filter(p => { const f = new Date(p.fechaPago); return f.getFullYear() === y && f.getMonth() === m })
    const gastosMes = gastos.filter(g => { const f = new Date(g.fecha); return f.getFullYear() === y && f.getMonth() === m })

    const licencia   = pagosMes.filter(p => p.concepto === "LICENCIA").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
    const marketing  = pagosMes.filter(p => p.concepto === "MARKETING").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
    const desarrollo = pagosMes.filter(p => p.concepto === "DESARROLLO").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
    const ingresos   = licencia + marketing + desarrollo
    const totalGastos = gastosMes.reduce((s, g) => s + toUSD(g.monto, g.moneda), 0)
    const margen     = ingresos - totalGastos
    const pct        = ingresos > 0 ? Math.round((margen / ingresos) * 100) : null

    meses.push({ key, label, ingresos, gastos: totalGastos, margen, pct, licencia, marketing, desarrollo })
  }

  // KPIs del mes actual
  const mesActual    = meses[meses.length - 1]
  const mesAnterior  = meses[meses.length - 2]

  const variacionIngresos = mesAnterior.ingresos > 0
    ? Math.round(((mesActual.ingresos - mesAnterior.ingresos) / mesAnterior.ingresos) * 100)
    : null

  const variacionGastos = mesAnterior.gastos > 0
    ? Math.round(((mesActual.gastos - mesAnterior.gastos) / mesAnterior.gastos) * 100)
    : null

  // Acumulado año en curso
  const anioActual = hoy.getFullYear()
  const acumIngresos = meses.filter(m => m.key.startsWith(String(anioActual))).reduce((s, m) => s + m.ingresos, 0)
  const acumGastos   = meses.filter(m => m.key.startsWith(String(anioActual))).reduce((s, m) => s + m.gastos, 0)
  const acumMargen   = acumIngresos - acumGastos

  return (
    <BalanceClient
      meses={meses}
      mesActualKey={`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`}
      kpis={{
        mesActual,
        variacionIngresos,
        variacionGastos,
        acumIngresos,
        acumGastos,
        acumMargen,
      }}
    />
  )
}
