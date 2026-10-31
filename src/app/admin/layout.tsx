import { auth, isOwnerEmail } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import AdminShell from "./_components/AdminShell"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  // Contador del menú: comprobantes de Hypnos POS por revisar (solo ADMIN)
  const posPendientes = session.user.role === "ADMIN"
    ? await prisma.posComprobante.count({ where: { estado: "PENDIENTE" } }).catch(() => 0)
    : 0

  return (
    <AdminShell role={session.user.role} userName={session.user.name ?? ""} isOwner={isOwnerEmail(session.user.email)}
      badges={{ "/admin/pos": posPendientes }}>
      {children}
    </AdminShell>
  )
}
