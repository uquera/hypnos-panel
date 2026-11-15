import type { Metadata } from "next"
import { getCatalogo, mpCheckoutListo } from "@/lib/pos/contratar"
import ContratarForm from "./ContratarForm"

export const metadata: Metadata = {
  title: "Contrata Hypnos POS",
  description: "Sistema para restaurantes y almacenes: caja, mesas, cocina, tienda online y pagos con tu máquina. Sin costo de incorporación.",
}
export const dynamic = "force-dynamic"

// Contratación online de Hypnos POS en 5 pasos: plan, adicionales, datos, pago y listo.
// ?tipo=almacen abre con almacén elegido; ?plan=anual con el plan anual; ?cupon=X precarga un cupón;
// ?o=canal queda en el pedido para saber de dónde vino (demo, instagram, whatsapp, almacenes…).
export default async function ContratarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const catalogo = await getCatalogo()
  return (
    <ContratarForm
      catalogo={catalogo}
      diasPrueba={catalogo.diasPrueba}
      mpListo={mpCheckoutListo()}
      inicial={{
        tipo: sp.tipo === "almacen" ? "ALMACEN" : "RESTAURANTE",
        plan: sp.plan === "anual" ? "ANUAL" : "MENSUAL",
        cupon: (sp.cupon ?? "").slice(0, 30),
        origen: (sp.o ?? "").slice(0, 40),
      }}
    />
  )
}
