import { requireSesionPos } from "@/lib/pos/sesion"
import { urlLogo } from "@/lib/pos/logo"
import PosMarcaForm from "@/app/_components/pos/PosMarcaForm"

export const metadata = { title: "Marca — Hypnos POS" }
export const dynamic = "force-dynamic"

export default async function PosMarcaPage() {
  const { cuenta } = await requireSesionPos()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Tu marca en la app</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Logo, colores y nombre que ve tu equipo en la máquina de pago. El código y el link del sistema los administra Hypnos.
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
    </div>
  )
}
