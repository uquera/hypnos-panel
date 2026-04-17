import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminShell from "./_components/AdminShell"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <AdminShell role={session.user.role} userName={session.user.name ?? ""}>
      {children}
    </AdminShell>
  )
}
