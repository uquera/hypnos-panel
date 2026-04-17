import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import PerfilForm from "./PerfilForm"

export const metadata = { title: "Mi perfil — Hypnos Panel" }

export default async function PerfilPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="space-y-1">
      <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Mi perfil</h1>
      <p className="text-sm text-gray-500 mb-5">Información de tu cuenta y seguridad</p>
      <PerfilForm
        nombre={session.user.name ?? ""}
        email={session.user.email ?? ""}
        role={session.user.role}
      />
    </div>
  )
}
