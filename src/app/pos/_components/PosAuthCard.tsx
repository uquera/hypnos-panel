import { Smartphone } from "lucide-react"

// Marco de las pantallas sin sesión del portal Hypnos POS (login, recuperar, crear contraseña).
export default function PosAuthCard({ titulo, subtitulo, children, pie }: {
  titulo: string; subtitulo?: string; children: React.ReactNode; pie?: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-gray-900">
            <Smartphone size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          {subtitulo && <p className="text-sm text-gray-500 mt-1">{subtitulo}</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8">
          {children}
        </div>
        {pie && <div className="mt-6 text-center text-sm">{pie}</div>}
      </div>
    </div>
  )
}

export const inputPos = "w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-colors"
export const labelPos = "text-xs font-semibold text-gray-500 tracking-wider uppercase"
export const botonPos = "w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gray-900 transition-all hover:bg-gray-800 disabled:opacity-60"
