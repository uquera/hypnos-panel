"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Terminal } from "lucide-react"

const ETIQUETAS: Record<string, string> = {
  MANUAL: "Instalación manual (no usa el comando)",
  PENDIENTE: "Pendiente",
  INSTALANDO: "Instalando…",
  LISTO: "Instalado",
  ERROR: "Error",
}

// Log de hypnos-pos-tenant. Mientras instala, refresca la página cada 4 s.
export default function LogInstalacion({ estadoAlta, altaAt, log, estancada, eliminada }: {
  cuentaId: string; estadoAlta: string; altaAt: string | null; log: string; estancada: boolean; eliminada: boolean
}) {
  const router = useRouter()
  const vivo = (estadoAlta === "INSTALANDO" || estadoAlta === "PENDIENTE") && !estancada
  useEffect(() => {
    if (!vivo) return
    const t = setInterval(() => router.refresh(), 4000)
    return () => clearInterval(t)
  }, [vivo, router])

  if (estadoAlta === "MANUAL" && !log) return null
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-gray-900 inline-flex items-center gap-2"><Terminal size={16} /> Instalación</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
        <p className="text-sm text-gray-700">
          Estado: <strong>{eliminada ? "Eliminada" : ETIQUETAS[estadoAlta] ?? estadoAlta}</strong>
          {estancada && <span className="text-amber-700"> · sin respuesta hace más de 15 min (el panel pudo reiniciarse): reintenta</span>}
          {altaAt && <span className="text-gray-400"> · iniciada {new Date(altaAt).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</span>}
        </p>
        {log
          ? <pre className="text-xs bg-gray-950 text-gray-100 rounded-xl p-3 max-h-80 overflow-auto whitespace-pre-wrap break-all">{log}</pre>
          : <p className="text-xs text-gray-400">Sin log todavía.</p>}
      </div>
    </section>
  )
}
