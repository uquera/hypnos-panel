import { getSesionPos } from "@/lib/pos/sesion"
import { urlLogo } from "@/lib/pos/logo"
import PortalNav from "./PortalNav"
import { cadenaDe } from "@/lib/pos/cadena"
import { IsotipoMi, MI } from "../_components/MarcaMi"
import SalirSoporte from "./SalirSoporte"

// Portal de dueños "Mi Hypnos" (mi.hypnosapps.com). Sesión propia (cookie hypnos_pos);
// cada página vuelve a pedir la sesión porque los layouts no se re-ejecutan al navegar.
// Sin sesión el layout no redirige: lo hace cada página con su ?next= (p. ej. /pos/pago).
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getSesionPos()
  if (!usuario) return <>{children}</>
  const { cuenta } = usuario
  const cadena = await cadenaDe(usuario.email)
  const logo = cuenta.logo ? urlLogo("", cuenta) : null

  return (
    <div className="min-h-screen bg-gray-50">
      {usuario.soporte && (
        <div className="text-white text-xs sm:text-sm" style={{ background: "#b45309" }}>
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-3">
            <span className="min-w-0 flex-1 break-words">
              <span className="font-semibold">Modo soporte</span>
              <span className="text-white/85"> · {usuario.soporte.nombre} viendo como <strong>{usuario.nombre}</strong><span className="hidden sm:inline"> ({usuario.email}). Lo que cambies aquí se aplica a su cuenta.</span></span>
            </span>
            <SalirSoporte />
          </div>
        </div>
      )}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/pos/inicio" className="shrink-0" title="Mi Hypnos"><IsotipoMi size={34} /></a>
          <div className="min-w-0 flex-1 flex items-center gap-2.5">
            <span className="hidden md:block font-extrabold tracking-tight text-gray-900 shrink-0">Mi <span style={{ color: MI.oro }}>Hypnos</span></span>
            <span className="hidden md:block w-px h-6 bg-gray-200 shrink-0" />
            {logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-100 p-0.5 shrink-0" />
              : null}
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate leading-tight">{cadena ? cadena.nombre : cuenta.nombre}</p>
              <p className="text-xs text-gray-400 leading-tight truncate">
                {cadena ? `${cadena.cuentas.length} locales` : <>Código <span className="font-mono">{cuenta.codigo}</span></>}
              </p>
            </div>
          </div>
          <PortalNav nombre={usuario.nombre} esDueno={usuario.rol === "DUENO"} conCadena={!!cadena} conSistema={!cadena && (cuenta.estadoAlta === "LISTO" || cuenta.estadoAlta === "MANUAL")} soporte={!!usuario.soporte} />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
