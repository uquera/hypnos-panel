"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, PauseCircle, PlayCircle } from "lucide-react"

// Bloquear o desbloquear la cuenta de marca de Hypnos POS (PosCuenta.activo). Bloqueada: la app
// Android recibe 403 y sus sub-cuentas no pueden entrar al portal. Es distinto de suspender la
// licencia por no pago (Acciones → Suspender), que se sincroniza con la instancia y deja pagar.
export default function EstadoCuentaButton({ id, activo, nombre }: { id: string; activo: boolean; nombre: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function cambiar() {
    if (activo && !confirm(`¿Bloquear la app y el portal de ${nombre}? La app de sus máquinas dejará de abrir su sistema y su equipo no podrá entrar al portal (ni pagar).`)) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.set("activo", String(!activo))
      const res  = await fetch(`/api/pos-admin/cuentas/${id}`, { method: "PATCH", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(data.error ?? "No se pudo cambiar el estado.")
      else { toast.success(activo ? "App y portal bloqueados" : "App y portal desbloqueados"); router.refresh() }
    } catch {
      toast.error("Error de red")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" onClick={cambiar} disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold border disabled:opacity-60 ${activo ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-700 hover:bg-green-50"}`}>
      {loading ? <Loader2 size={13} className="animate-spin" /> : activo ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
      {activo ? "Bloquear app" : "Desbloquear app"}
    </button>
  )
}
