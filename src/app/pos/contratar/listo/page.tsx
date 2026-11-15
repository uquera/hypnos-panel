import type { Metadata } from "next"
import ListoCliente from "./ListoCliente"

export const metadata: Metadata = { title: "Tu sistema — Hypnos POS" }
export const dynamic = "force-dynamic"

// Paso 5 de la contratación: estado del pago (Mercado Pago vuelve aquí) y de la instalación.
export default async function ListoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  return <ListoCliente pedido={sp.p ?? ""} token={sp.t ?? ""} fallo={sp.fallo === "1"} />
}
