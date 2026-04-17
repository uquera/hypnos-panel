"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Archive } from "lucide-react"

export function ArchivarButton({ clienteId }: { clienteId: string }) {
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const router = useRouter()

  async function handleArchivar() {
    setLoading(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        toast.success("Cliente archivado")
        router.push("/admin")
      } else {
        toast.error("Error al archivar")
      }
    } catch {
      toast.error("Error de red")
    } finally {
      setLoading(false)
    }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
      >
        <Archive size={14} />
        Archivar cliente
      </button>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-red-700 font-medium">¿Confirmar archivar?</p>
      <button
        onClick={handleArchivar}
        disabled={loading}
        className="px-4 h-9 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60"
      >
        {loading ? "Archivando..." : "Sí, archivar"}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="px-4 h-9 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        Cancelar
      </button>
    </div>
  )
}
