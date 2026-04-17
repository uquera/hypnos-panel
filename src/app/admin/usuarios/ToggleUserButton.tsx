"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export default function ToggleUserButton({ userId, activo }: { userId: string; activo: boolean }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    setLoading(true)
    try {
      const res = await fetch(`/api/usuarios/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !activo }),
      })
      if (res.ok) {
        toast.success(activo ? "Usuario desactivado" : "Usuario reactivado")
        router.refresh()
      } else {
        toast.error("Error al actualizar usuario")
      }
    } catch {
      toast.error("Error de red")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={[
        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50",
        activo
          ? "text-red-600 bg-red-50 hover:bg-red-100"
          : "text-green-600 bg-green-50 hover:bg-green-100",
      ].join(" ")}
    >
      {loading ? "..." : activo ? "Desactivar" : "Reactivar"}
    </button>
  )
}
