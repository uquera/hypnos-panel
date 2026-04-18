"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  clienteId: string
  clienteNombre: string
}

export default function RenovarButton({ clienteId, clienteNombre }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRenovar() {
    if (!confirm(`¿Renovar licencia de ${clienteNombre} por +30 días?`)) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/clientes/${clienteId}/renovar`, { method: "PATCH" })
      const data = await res.json()
      if (res.ok) {
        if (data.syncedRemote) {
          toast.success(`${clienteNombre} renovado y sincronizado`)
        } else {
          toast.warning(`${clienteNombre} renovado localmente (cliente sin conexión)`)
        }
        router.refresh()
      } else {
        toast.error(data.error ?? "Error al renovar")
      }
    } catch {
      toast.error("Error de red al renovar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRenovar}
      disabled={loading}
      title="Renovar +30 días"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
    >
      {loading
        ? <Loader2 size={12} className="animate-spin" />
        : <RefreshCw size={12} />
      }
      <span className="hidden lg:inline">+30 días</span>
    </button>
  )
}
