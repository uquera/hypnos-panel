import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import LoginForm from "./LoginForm"

export const metadata = { title: "Iniciar sesión — Hypnos Panel" }

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect("/admin")

  return <LoginForm />
}
