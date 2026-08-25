import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import LeadsClient from "./LeadsClient"

export const dynamic = "force-dynamic"
export const metadata = { title: "Leads — Hypnos Panel" }

export default async function LeadsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } })

  const serial = leads.map(l => ({
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
  }))

  return <LeadsClient leads={serial} isAdmin={session.user.role === "ADMIN"} />
}
