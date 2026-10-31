import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { precioMensual, diasPrueba } from "@/lib/pos/config"
import { claveDiaChile, sumarMeses } from "@/lib/pos/fechas"
import CrearRestauranteForm from "./CrearRestauranteForm"

export const metadata = { title: "Crear restaurante — Hypnos POS" }
export const dynamic = "force-dynamic"

// Mismo flujo que el registro público (/pos/registro): crea la licencia, la cuenta, invita al
// dueño e instala el sistema en <codigo>.hypnosapps.com. Con prueba o con vencimiento a elección.
export default async function CrearRestaurantePage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin/pos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> Hypnos POS
        </Link>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mt-2">Crear restaurante</h1>
        <p className="text-sm text-gray-500 mt-0.5">Se instala su sistema automáticamente y el dueño recibe el correo de bienvenida</p>
      </div>
      <CrearRestauranteForm
        precioGeneral={precioMensual()}
        diasPrueba={diasPrueba()}
        venceDefecto={claveDiaChile(sumarMeses(new Date(), 1))}
      />
    </div>
  )
}
