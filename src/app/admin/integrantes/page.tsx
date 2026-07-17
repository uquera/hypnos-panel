import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import IntegrantesClient from "./IntegrantesClient"
import { toUSD } from "@/lib/monedas"

export const dynamic = "force-dynamic"
export const metadata = { title: "Integrantes — Hypnos Panel" }

export const META_MENSUAL_USD = 200

export default async function IntegrantesPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/admin")

  const hoy   = new Date()
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const finMesAnterior    = new Date(hoy.getFullYear(), hoy.getMonth(), 0, 23, 59, 59)

  const [todosPagos, todosGastos, todosCustodias] = await Promise.all([
    prisma.pago.findMany({
      select: { id: true, monto: true, moneda: true, fechaPago: true, registradoPorId: true, custodioId: true },
    }),
    prisma.gasto.findMany({
      select: { monto: true, moneda: true, fecha: true, registradoPorId: true, custodioId: true },
    }),
    // Split de custodia: saber cuánto tiene cada usuario de cada pago
    prisma.pagoCustodia.findMany({
      select: { pagoId: true, userId: true, monto: true },
    }),
  ])

  // Índice rápido: pagoId → {moneda, fechaPago}
  const pagosIdx = new Map(todosPagos.map(p => [p.id, { moneda: p.moneda, fechaPago: p.fechaPago }]))
  // Set de pagoIds que ya tienen custodias split
  const pagosConSplit = new Set(todosCustodias.map(c => c.pagoId))

  const usuarios = await prisma.user.findMany({
    where:   { activo: true },
    orderBy: { createdAt: "asc" },
    include: {
      retiros: {
        select: { id: true, monto: true, moneda: true, fecha: true, concepto: true, createdAt: true },
        orderBy: { fecha: "desc" },
      },
    },
  })

  function calcMetricas(user: typeof usuarios[0], desde?: Date, hasta?: Date) {
    const filtrarFecha = (f: Date) =>
      (!desde || f >= desde) && (!hasta || f <= hasta)

    // Cobrado desde custodias split (prioridad)
    const cobradoSplit = todosCustodias
      .filter(c => {
        if (c.userId !== user.id) return false
        const pago = pagosIdx.get(c.pagoId)
        return pago ? filtrarFecha(new Date(pago.fechaPago)) : false
      })
      .reduce((s, c) => {
        const pago = pagosIdx.get(c.pagoId)!
        return s + toUSD(c.monto, pago.moneda)
      }, 0)

    // Cobrado desde pagos legacy (sin custodias split)
    const cobradoLegacy = todosPagos
      .filter(p => {
        if (pagosConSplit.has(p.id)) return false // ya lo cubre el split
        const efectivoCustodio = p.custodioId ?? p.registradoPorId
        return efectivoCustodio === user.id && filtrarFecha(new Date(p.fechaPago))
      })
      .reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)

    const cobrado = cobradoSplit + cobradoLegacy

    const gastado = todosGastos
      .filter(g => {
        const efectivoCustodio = g.custodioId ?? g.registradoPorId
        return efectivoCustodio === user.id && filtrarFecha(new Date(g.fecha))
      })
      .reduce((s, g) => s + toUSD(g.monto, g.moneda), 0)

    const retirado = user.retiros
      .filter(r => filtrarFecha(new Date(r.fecha)))
      .reduce((s, r) => s + toUSD(r.monto, r.moneda), 0)

    const disponible = cobrado - gastado - retirado

    return { cobrado, gastado, retirado, disponible }
  }

  const integrantes = usuarios.map(u => {
    const mesActual   = calcMetricas(u, inicioMesActual)
    const mesAnterior = calcMetricas(u, inicioMesAnterior, finMesAnterior)
    const historico   = calcMetricas(u)

    return {
      id:     u.id,
      nombre: u.nombre,
      email:  u.email,
      role:   u.role,
      mesActual,
      mesAnterior,
      historico,
      retiros: u.retiros.map(r => ({
        id:       r.id,
        monto:    r.monto,
        moneda:   r.moneda,
        fecha:    r.fecha.toISOString(),
        concepto: r.concepto,
      })),
    }
  })

  // Totales del equipo (mes actual)
  const totalEquipo = {
    cobrado:    integrantes.reduce((s, i) => s + i.mesActual.cobrado, 0),
    gastado:    integrantes.reduce((s, i) => s + i.mesActual.gastado, 0),
    retirado:   integrantes.reduce((s, i) => s + i.mesActual.retirado, 0),
    disponible: integrantes.reduce((s, i) => s + i.mesActual.disponible, 0),
  }

  return (
    <IntegrantesClient
      integrantes={integrantes}
      totalEquipo={totalEquipo}
      metaMensualUSD={META_MENSUAL_USD}
      usuarioActualId={session.user.id ?? ""}
      usuarioActualRole={session.user.role ?? ""}
    />
  )
}
