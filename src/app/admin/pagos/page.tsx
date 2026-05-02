import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { calcularEstado } from "@/lib/licencia-utils"
import PagosClient from "./PagosClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Pagos — Hypnos Panel" }

export default async function PagosPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const hoy       = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const finMesAnterior    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59)
  const hace12Meses       = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
  const en30Dias          = new Date(Date.now() + 30 * 86_400_000)

  const [pagos, clientes, pagosChart] = await Promise.all([
    prisma.pago.findMany({
      include: {
        cliente:      { select: { id: true, nombre: true, dominio: true } },
        registradoPor: { select: { nombre: true } },
      },
      orderBy: { fechaPago: "desc" },
    }),
    prisma.cliente.findMany({
      where:   { activo: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.pago.findMany({
      where:  { fechaPago: { gte: hace12Meses }, moneda: "CLP" },
      select: { fechaPago: true, monto: true },
    }),
  ])

  // KPIs
  const totalEsteMes = pagos
    .filter(p => p.moneda === "CLP" && new Date(p.fechaPago) >= inicioMes)
    .reduce((s, p) => s + p.monto, 0)

  const totalMesAnterior = pagos
    .filter(p => p.moneda === "CLP" &&
      new Date(p.fechaPago) >= inicioMesAnterior &&
      new Date(p.fechaPago) <= finMesAnterior)
    .reduce((s, p) => s + p.monto, 0)

  const totalHistorico = pagos
    .filter(p => p.moneda === "CLP")
    .reduce((s, p) => s + p.monto, 0)

  const variacionPct = totalMesAnterior > 0
    ? Math.round(((totalEsteMes - totalMesAnterior) / totalMesAnterior) * 100)
    : null

  // Clientes activos y por vencer
  const clientesConEstado = clientes.map(c => ({
    ...c,
    estado: calcularEstado(c),
    fechaVencimiento: c.fechaVencimiento.toISOString(),
  }))

  const clientesActivos   = clientesConEstado.filter(c => c.estado.diasRestantes > 0 && !c.suspendida).length
  const clientesPorVencer = clientesConEstado.filter(c =>
    !c.suspendida && c.estado.diasRestantes > 0 && c.estado.diasRestantes <= 30
  )

  // IDs de clientes que tienen pago en los últimos 30 días
  const hace30Dias = new Date(Date.now() - 30 * 86_400_000)
  const clientesConPagoReciente = new Set(
    pagos
      .filter(p => new Date(p.fechaPago) >= hace30Dias)
      .map(p => p.clienteId)
  )
  const clientesSinPagoReciente = clientesPorVencer.filter(
    c => !clientesConPagoReciente.has(c.id)
  )

  // Datos del gráfico: últimos 12 meses
  const chartMonths: { label: string; key: string; total: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d     = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })
    const total = pagosChart
      .filter(p => {
        const fp = new Date(p.fechaPago)
        return fp.getFullYear() === d.getFullYear() && fp.getMonth() === d.getMonth()
      })
      .reduce((s, p) => s + p.monto, 0)
    chartMonths.push({ label, key, total })
  }

  // Serializar pagos para el cliente
  const pagosSerial = pagos.map(p => ({
    id:           p.id,
    clienteId:    p.clienteId,
    clienteNombre: p.cliente.nombre,
    clienteDominio: p.cliente.dominio,
    monto:        p.monto,
    moneda:       p.moneda,
    periodoInicio: p.periodoInicio.toISOString(),
    periodoFin:    p.periodoFin.toISOString(),
    fechaPago:     p.fechaPago.toISOString(),
    comprobante:  p.comprobante,
    notas:        p.notas,
    registradoPor: p.registradoPor.nombre,
  }))

  const clientesSerial = clientes.map(c => ({
    id:     c.id,
    nombre: c.nombre,
  }))

  const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`

  return (
    <PagosClient
      pagos={pagosSerial}
      clientes={clientesSerial}
      clientesSinPagoReciente={clientesSinPagoReciente.map(c => ({
        id:            c.id,
        nombre:        c.nombre,
        diasRestantes: c.estado.diasRestantes,
      }))}
      chartMonths={chartMonths}
      mesActualKey={mesActualKey}
      kpis={{
        totalEsteMes,
        totalMesAnterior,
        variacionPct,
        totalHistorico,
        clientesActivos,
        clientesPorVencer: clientesPorVencer.length,
      }}
      isAdmin={session.user.role === "ADMIN"}
    />
  )
}
