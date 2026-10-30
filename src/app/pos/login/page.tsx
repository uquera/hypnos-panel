import { redirect } from "next/navigation"
import { getSesionPos } from "@/lib/pos/sesion"
import PosLoginForm from "./PosLoginForm"

export const metadata = { title: "Ingresar — Hypnos POS" }
export const dynamic = "force-dynamic"

export default async function PosLoginPage() {
  if (await getSesionPos()) redirect("/pos/marca")
  return <PosLoginForm />
}
