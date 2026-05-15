import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import GastosClient from "./GastosClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Gastos — Hypnos Panel" }

function toUSD(monto: number, moneda: string) {
  if (moneda === "USD") return monto
  if (moneda === "CLP") return monto / 1000
  return monto
}

export default async function GastosPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const hoy       = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  const [gastos, usuarios] = await Promise.all([
    prisma.gasto.findMany({
      include: {
        registradoPor: { select: { nombre: true } },
        custodio:      { select: { id: true, nombre: true } },
      },
      orderBy: { fecha: "desc" },
    }),
    prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ])

  const totalEsteMes  = gastos
    .filter(g => new Date(g.fecha) >= inicioMes)
    .reduce((s, g) => s + toUSD(g.monto, g.moneda), 0)

  const totalHistorico = gastos.reduce((s, g) => s + toUSD(g.monto, g.moneda), 0)

  // KPIs por categoría (este mes)
  const categorias = ["HERRAMIENTA_IA", "SOFTWARE", "INFRAESTRUCTURA", "PUBLICIDAD", "OTRO"] as const
  const porCategoria: Record<string, number> = {}
  for (const cat of categorias) {
    porCategoria[cat] = gastos
      .filter(g => new Date(g.fecha) >= inicioMes && g.categoria === cat)
      .reduce((s, g) => s + toUSD(g.monto, g.moneda), 0)
  }

  const gastosSerial = gastos.map(g => ({
    id:              g.id,
    concepto:        g.concepto,
    categoria:       g.categoria,
    monto:           g.monto,
    moneda:          g.moneda,
    fecha:           g.fecha.toISOString(),
    comprobante:     g.comprobante,
    notas:           g.notas,
    registradoPor:   g.registradoPor.nombre,
    custodioId:      g.custodioId ?? null,
    custodioNombre:  g.custodio?.nombre ?? g.registradoPor.nombre,
  }))

  return (
    <GastosClient
      gastos={gastosSerial}
      usuarios={usuarios}
      currentUserId={session.user.id ?? ""}
      kpis={{ totalEsteMes, totalHistorico, porCategoria }}
      isAdmin={session.user.role === "ADMIN"}
    />
  )
}
