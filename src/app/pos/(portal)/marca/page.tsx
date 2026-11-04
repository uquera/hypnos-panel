import { requireSesionPos } from "@/lib/pos/sesion"
import { urlLogo } from "@/lib/pos/logo"
import Link from "next/link"
import { ArrowRight, ExternalLink } from "lucide-react"
import PosMarcaForm from "@/app/_components/pos/PosMarcaForm"

export const metadata = { title: "Marca — Hypnos POS" }
export const dynamic = "force-dynamic"

export default async function PosMarcaPage() {
  const { cuenta } = await requireSesionPos("/pos/marca")
  const conSistema = cuenta.estadoAlta === "LISTO" || cuenta.estadoAlta === "MANUAL"

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Tu marca en la máquina de pago</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Opcional: logo, colores y nombre de la app Hypnos POS en tu máquina TUU. Tu sistema ya funciona aunque no cambies nada aquí.
        </p>
      </div>
      <PosMarcaForm
        key={cuenta.updatedAt.getTime()}
        modo="portal"
        cuenta={{
          id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre, posUrl: cuenta.posUrl,
          clienteId: null, logoUrl: urlLogo("", cuenta),
          colorPrimario: cuenta.colorPrimario, colorTextoPrimario: cuenta.colorTextoPrimario,
          colorFondo: cuenta.colorFondo, colorTexto: cuenta.colorTexto,
        }}
      />
      {conSistema && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <p className="font-bold text-gray-900">¿Listo? Empieza a usar tu sistema</p>
          <p className="text-sm text-gray-500 mt-0.5">Guarda tus cambios y entra: mesas, comandas, caja y boletas.</p>
          <a href="/api/pos-portal/abrir" target="_blank" rel="noopener"
            className="mt-4 w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2 hover:opacity-95 transition"
            style={{ background: "#f26522" }}>
            Abrir mi sistema <ExternalLink size={16} />
          </a>
          <Link href="/pos/inicio" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800">
            Ver primeros pasos <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  )
}
