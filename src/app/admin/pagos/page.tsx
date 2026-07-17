import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { calcularEstado } from "@/lib/licencia-utils"
import PagosClient from "./PagosClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Ingresos — Hypnos Panel" }

function toUSD(monto: number, moneda: string): number {
  if (moneda === "USD") return monto
  if (moneda === "CLP") return monto / 1000
  return monto
}

export default async function PagosPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const hoy               = new Date()
  const inicioMes         = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const finMesAnterior    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59)
  const hace12Meses       = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)

  const [pagos, clientes, pagosChart, usuarios] = await Promise.all([
    prisma.pago.findMany({
      include: {
        cliente:       { select: { id: true, nombre: true, dominio: true } },
        registradoPor: { select: { nombre: true } },
        custodio:      { select: { id: true, nombre: true } },
        custodias:     { include: { usuario: { select: { id: true, nombre: true } } }, orderBy: { monto: "desc" } },
      },
      orderBy: { fechaPago: "desc" },
    }),
    prisma.cliente.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.pago.findMany({
      where:  { fechaPago: { gte: hace12Meses } },
      select: { fechaPago: true, monto: true, moneda: true, concepto: true },
    }),
    prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ])

  // KPIs globales
  const pagosEsteMes     = pagos.filter(p => new Date(p.fechaPago) >= inicioMes)
  const pagosMesAnterior = pagos.filter(p => {
    const f = new Date(p.fechaPago)
    return f >= inicioMesAnterior && f <= finMesAnterior
  })

  const totalEsteMes     = pagosEsteMes.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
  const totalMesAnterior = pagosMesAnterior.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
  const totalHistorico   = pagos.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
  const variacionPct     = totalMesAnterior > 0
    ? Math.round(((totalEsteMes - totalMesAnterior) / totalMesAnterior) * 100)
    : null

  // KPIs por vertical (este mes)
  const verticalesEsteMes = {
    licencia:   pagosEsteMes.filter(p => p.concepto === "LICENCIA").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0),
    marketing:  pagosEsteMes.filter(p => p.concepto === "MARKETING").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0),
    desarrollo: pagosEsteMes.filter(p => p.concepto === "DESARROLLO").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0),
  }

  // Clientes activos y por vencer
  const clientesConEstado     = clientes.map(c => ({ ...c, estado: calcularEstado(c), fechaVencimiento: c.fechaVencimiento.toISOString() }))
  const clientesActivos       = clientesConEstado.filter(c => c.estado.diasRestantes > 0 && !c.suspendida).length
  const clientesPorVencer     = clientesConEstado.filter(c => !c.suspendida && c.estado.diasRestantes > 0 && c.estado.diasRestantes <= 30)
  const hace30Dias            = new Date(Date.now() - 30 * 86_400_000)
  const clientesConPagoRec    = new Set(pagos.filter(p => new Date(p.fechaPago) >= hace30Dias && p.concepto === "LICENCIA").map(p => p.clienteId))
  const clientesSinPagoRec    = clientesPorVencer.filter(c => !clientesConPagoRec.has(c.id))

  // Gráfico: últimos 12 meses — barras apiladas por vertical
  const chartMonths: {
    label: string
    key: string
    licencia: number
    marketing: number
    desarrollo: number
    total: number
  }[] = []

  for (let i = 11; i >= 0; i--) {
    const d      = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const key    = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label  = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })
    const delMes = pagosChart.filter(p => {
      const fp = new Date(p.fechaPago)
      return fp.getFullYear() === d.getFullYear() && fp.getMonth() === d.getMonth()
    })
    const licencia   = delMes.filter(p => p.concepto === "LICENCIA").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
    const marketing  = delMes.filter(p => p.concepto === "MARKETING").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
    const desarrollo = delMes.filter(p => p.concepto === "DESARROLLO").reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
    chartMonths.push({ label, key, licencia, marketing, desarrollo, total: licencia + marketing + desarrollo })
  }

  // Quitar meses vacíos al inicio: el gráfico parte desde el primer mes con registros
  const primerMesConDatos = chartMonths.findIndex(m => m.total > 0)
  const chartMonthsVisibles = primerMesConDatos > 0 ? chartMonths.slice(primerMesConDatos) : chartMonths

  // Serializar pagos
  const pagosSerial = pagos.map(p => ({
    id:              p.id,
    clienteId:       p.clienteId,
    clienteNombre:   p.cliente.nombre,
    clienteDominio:  p.cliente.dominio,
    concepto:        p.concepto,
    conceptoDetalle: p.conceptoDetalle,
    monto:           p.monto,
    moneda:          p.moneda,
    periodoInicio:   p.periodoInicio?.toISOString() ?? null,
    periodoFin:      p.periodoFin?.toISOString()    ?? null,
    fechaPago:       p.fechaPago.toISOString(),
    comprobante:     p.comprobante,
    notas:           p.notas,
    registradoPor:   p.registradoPor.nombre,
    custodioId:      p.custodioId ?? null,
    custodioNombre:  p.custodio?.nombre ?? p.registradoPor.nombre,
    custodias:       p.custodias.map(c => ({ userId: c.userId, userName: c.usuario.nombre, monto: c.monto })),
  }))

  const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`

  return (
    <PagosClient
      pagos={pagosSerial}
      clientes={clientes.map(c => ({ id: c.id, nombre: c.nombre }))}
      usuarios={usuarios}
      currentUserId={session.user.id ?? ""}
      clientesSinPagoReciente={clientesSinPagoRec.map(c => ({
        id: c.id, nombre: c.nombre, diasRestantes: c.estado.diasRestantes,
      }))}
      chartMonths={chartMonthsVisibles}
      mesActualKey={mesActualKey}
      kpis={{ totalEsteMes, totalMesAnterior, variacionPct, totalHistorico, clientesActivos, clientesPorVencer: clientesPorVencer.length, verticalesEsteMes }}
      isAdmin={session.user.role === "ADMIN"}
    />
  )
}
