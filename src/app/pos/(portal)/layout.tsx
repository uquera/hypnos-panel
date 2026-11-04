import { getSesionPos } from "@/lib/pos/sesion"
import { urlLogo } from "@/lib/pos/logo"
import PortalNav from "./PortalNav"

// Portal de las sub-cuentas (/pos/marca, /pos/equipo). Sesión propia (cookie hypnos_pos);
// cada página vuelve a pedir la sesión porque los layouts no se re-ejecutan al navegar.
// Sin sesión el layout no redirige: lo hace cada página con su ?next= (p. ej. /pos/pago).
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getSesionPos()
  if (!usuario) return <>{children}</>
  const { cuenta } = usuario

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          {cuenta.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={urlLogo("", cuenta)!} alt="" className="w-9 h-9 rounded-lg object-contain bg-gray-50 border border-gray-100 p-0.5 shrink-0" />
            : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold shrink-0" style={{ background: cuenta.colorPrimario }}>{cuenta.nombre.charAt(0)}</div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 truncate leading-tight">{cuenta.nombre}</p>
            <p className="text-xs text-gray-400 leading-tight">Hypnos POS · código <span className="font-mono whitespace-nowrap">{cuenta.codigo}</span></p>
          </div>
          <PortalNav nombre={usuario.nombre} esDueno={usuario.rol === "DUENO"} conSistema={cuenta.estadoAlta === "LISTO" || cuenta.estadoAlta === "MANUAL"} />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
