import { BarChart3, FileSpreadsheet, MousePointerClick, Store } from "lucide-react"
import { MarcaMi, MI } from "./MarcaMi"

// Marco de las pantallas sin sesión del portal de dueños "Mi Hypnos" (login, recuperar,
// crear contraseña, pagar). En pantallas anchas, a la izquierda la marca y lo que ofrece.
const PUNTOS = [
  { icono: Store,            texto: "Todos tus locales en un solo lugar" },
  { icono: BarChart3,        texto: "Ventas del día, canales y medios de pago comparados" },
  { icono: FileSpreadsheet,  texto: "Reportes consolidados en Excel" },
  { icono: MousePointerClick, texto: "Entra al sistema de cada local con un clic" },
]

export default function PosAuthCard({ titulo, subtitulo, children, pie }: {
  titulo: string; subtitulo?: string; children: React.ReactNode; pie?: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="hidden lg:flex w-[44%] max-w-xl flex-col justify-between p-12 text-white relative overflow-hidden" style={{ background: MI.tinta }}>
        <div aria-hidden className="absolute -right-24 -top-24 w-80 h-80 rounded-full opacity-20 blur-3xl" style={{ background: MI.oro }} />
        <MarcaMi claro size={40} sub="Para dueños y franquicias" />
        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight">El centro de control<br />de tus locales.</h2>
          <ul className="mt-8 space-y-4">
            {PUNTOS.map(p => (
              <li key={p.texto} className="flex items-center gap-3 text-sm text-white/80">
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(212,167,44,.15)", color: MI.oro }}><p.icono size={16} /></span>
                {p.texto}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/40">Hypnos SpA · hypnosapps.com</p>
      </aside>

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="lg:hidden mb-6 flex justify-center"><MarcaMi size={40} sub="Para dueños y franquicias" /></div>
            <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
            {subtitulo && <p className="text-sm text-gray-500 mt-1">{subtitulo}</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
            {children}
          </div>
          {pie && <div className="mt-6 text-center text-sm">{pie}</div>}
        </div>
      </div>
    </div>
  )
}

export const inputPos = "w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-colors"
export const labelPos = "text-xs font-semibold text-gray-500 tracking-wider uppercase"
export const botonPos = "w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-[#0b1220] transition-all hover:bg-gray-800 disabled:opacity-60"
