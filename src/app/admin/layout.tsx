import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import AdminSidebar from "./_components/AdminSidebar"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AdminSidebar role={session.user.role} userName={session.user.name ?? ""} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
