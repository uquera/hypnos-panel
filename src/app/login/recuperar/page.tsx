import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import RecuperarForm from "./RecuperarForm"

export const metadata = { title: "Recuperar contraseña — Hypnos Panel" }

export default async function RecuperarPage() {
  const session = await auth()
  if (session) redirect("/admin")
  return <RecuperarForm />
}
