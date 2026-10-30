import { redirect } from "next/navigation"
import { getSesionPos } from "@/lib/pos/sesion"

export const dynamic = "force-dynamic"

export default async function PosInicio() {
  redirect((await getSesionPos()) ? "/pos/marca" : "/pos/login")
}
