import { redirect } from "next/navigation"
import { destinoPortal, getSesionPos } from "@/lib/pos/sesion"
import PosLoginForm from "./PosLoginForm"

export const metadata = { title: "Ingresar — Mi Hypnos" }
export const dynamic = "force-dynamic"

export default async function PosLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const destino = destinoPortal((await searchParams).next)
  if (await getSesionPos()) redirect(destino)
  return <PosLoginForm destino={destino} />
}
