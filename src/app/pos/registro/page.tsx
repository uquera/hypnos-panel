import type { Metadata } from "next"
import { precioMensual, diasPrueba, formatoCLP } from "@/lib/pos/config"
import RegistroForm from "./RegistroForm"

export const metadata: Metadata = {
  title: "Prueba gratis — Hypnos POS",
  description: "Sistema para restaurantes: mesas, comandas, caja y boletas. Pruébalo gratis.",
}
export const dynamic = "force-dynamic"

// Registro público de Hypnos POS: crea el restaurante, instala su sistema en
// <codigo>.hypnosapps.com y arranca la prueba gratis.
export default function RegistroPosPage() {
  return <RegistroForm precio={formatoCLP(precioMensual())} diasPrueba={diasPrueba()} />
}
