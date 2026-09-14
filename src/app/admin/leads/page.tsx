import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { buscarRespaldo } from "@/lib/agenda"
import LeadsClient from "./LeadsClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Leads — Hypnos Panel" }

export default async function LeadsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const [leads, respaldos] = await Promise.all([
    prisma.lead.findMany({ orderBy: { createdAt: "desc" } }),
    // Sin el JSON completo: solo lo necesario para vincular y mostrar el uso
    prisma.agendaBackup.findMany({
      orderBy: { ultimaActividad: "desc" },
      select: {
        agendaId: true, slug: true, email: true, telefono: true,
        clientes: true, servicios: true, citas: true, movimientos: true, ultimaActividad: true,
      },
    }),
  ])

  const serial = leads.map(l => {
    const r = buscarRespaldo(l, respaldos)
    return {
      id:        l.id,
      negocio:   l.negocio,
      tipo:      l.tipo,
      nombre:    l.nombre,
      whatsapp:  l.whatsapp,
      email:     l.email,
      origen:    l.origen,
      conLogo:   l.conLogo,
      estado:    l.estado,
      notas:     l.notas ?? null,
      createdAt: l.createdAt.toISOString(),
      uso: r ? {
        citas:           r.citas,
        clientes:        r.clientes,
        servicios:       r.servicios,
        movimientos:     r.movimientos,
        ultimaActividad: r.ultimaActividad.toISOString(),
      } : null,
    }
  })

  return <LeadsClient leads={serial} isAdmin={session.user.role === "ADMIN"} />
}
