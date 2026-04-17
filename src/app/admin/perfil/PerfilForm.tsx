"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react"

interface Props {
  nombre: string
  email:  string
  role:   string
}

export default function PerfilForm({ nombre, email, role }: Props) {
  const [form, setForm]       = useState({ actual: "", nueva: "", confirmar: "" })
  const [show, setShow]       = useState({ actual: false, nueva: false, confirmar: false })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (form.nueva.length < 8) {
      toast.error("La nueva contraseña debe tener al menos 8 caracteres")
      return
    }
    if (form.nueva !== form.confirmar) {
      toast.error("Las contraseñas no coinciden")
      return
    }

    setLoading(true)
    try {
      const res = await fetch("/api/perfil/password", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ actual: form.actual, nueva: form.nueva }),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success("Contraseña actualizada correctamente")
        setForm({ actual: "", nueva: "", confirmar: "" })
      } else {
        toast.error(data.error ?? "Error al actualizar la contraseña")
      }
    } catch {
      toast.error("Error de red")
    } finally {
      setLoading(false)
    }
  }

  const toggleField = (field: keyof typeof show) =>
    setShow(s => ({ ...s, [field]: !s[field] }))

  return (
    <div className="max-w-lg space-y-6">

      {/* Datos del perfil */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h2 className="text-base font-bold text-gray-900">Información de la cuenta</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
            <span className="text-sm text-gray-500">Nombre</span>
            <span className="text-sm font-semibold text-gray-800">{nombre}</span>
          </div>
          <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
            <span className="text-sm text-gray-500">Correo</span>
            <span className="text-sm font-semibold text-gray-800">{email}</span>
          </div>
          <div className="flex items-center justify-between py-2.5">
            <span className="text-sm text-gray-500">Rol</span>
            <span className={[
              "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold",
              role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600",
            ].join(" ")}>
              {role === "ADMIN" ? "Administrador" : "Cobrador"}
            </span>
          </div>
        </div>
      </div>

      {/* Cambiar contraseña */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-gray-400" />
          <h2 className="text-base font-bold text-gray-900">Cambiar contraseña</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(["actual", "nueva", "confirmar"] as const).map((field) => {
            const labels = { actual: "Contraseña actual", nueva: "Nueva contraseña", confirmar: "Confirmar nueva contraseña" }
            return (
              <div key={field} className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {labels[field]}
                </label>
                <div className="relative">
                  <input
                    type={show[field] ? "text" : "password"}
                    placeholder="••••••••"
                    value={form[field]}
                    onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
                    required
                    minLength={field === "actual" ? 1 : 8}
                    className="w-full h-11 px-3.5 pr-11 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => toggleField(field)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {show[field] ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {field === "nueva" && (
                  <p className="text-xs text-gray-400">Mínimo 8 caracteres</p>
                )}
              </div>
            )
          })}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
          >
            {loading ? "Actualizando..." : <><CheckCircle2 size={15} /> Actualizar contraseña</>}
          </button>
        </form>
      </div>
    </div>
  )
}
