import type { Metadata } from "next"
import { getCatalogo } from "@/lib/pos/contratar"
import MaquinaForm from "./MaquinaForm"

export const metadata: Metadata = {
  title: "Consigue tu máquina de pago — Hypnos POS",
  description: "Pide tu Mercado Pago Point Smart 2 o tu máquina TUU, conectada a la caja de Hypnos POS. Nosotros gestionamos la solicitud.",
}
export const dynamic = "force-dynamic"

// "Consigue tu máquina": el comercio pide una Point Smart 2 (la vende Hypnos) o una TUU (Hypnos
// gestiona la solicitud con TUU). Se guarda en PosSolicitudMaquina y se gestiona en /admin/pos/contratar.
// ?marca=mp|tuu preselecciona la máquina; ?o=canal queda en la solicitud.
export default async function MaquinaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const cat = await getCatalogo()
  return (
    <MaquinaForm
      precioPoint={cat.point}
      pointConStock={cat.pointActiva}
      inicial={{
        marca: sp.marca === "tuu" ? "TUU" : sp.marca === "mp" ? "MERCADOPAGO" : null,
        origen: (sp.o ?? "").slice(0, 40),
      }}
    />
  )
}
