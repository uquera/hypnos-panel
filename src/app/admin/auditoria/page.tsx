import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AuditoriaClient from "./AuditoriaClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Auditoría — Hypnos Panel" }

export default async function AuditoriaPage() {
  const session = await auth()
  if (!session) redirect("/login")

  // Traer los últimos 500 registros — el filtrado se hace en cliente
  const logs = await prisma.actividadLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  })

  const serial = logs.map(l => ({
    id:            l.id,
    usuarioNombre: l.usuarioNombre,
    clienteNombre: l.clienteNombre ?? null,
    accion:        l.accion,
    detalle:       l.detalle ?? null,
    createdAt:     l.createdAt.toISOString(),
  }))

  return <AuditoriaClient logs={serial} />
}
