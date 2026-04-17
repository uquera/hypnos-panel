"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Save } from "lucide-react"

interface Props {
  clienteId: string
  nombre:    string
  dominio:   string
  apiUrl:    string
  masterKey: string
}

export default function EditClienteForm({
  clienteId, nombre, dominio, apiUrl, masterKey,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ nombre, dominio, apiUrl, masterKey })
  const [showKey, setShowKey] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch(`/api/clientes/${clienteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success("Datos del cliente actualizados")
      } else {
        toast.error("Error al guardar")
      }
    } catch {
      toast.error("Error de red")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
            className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dominio</label>
          <input
            type="text"
            value={form.dominio}
            onChange={(e) => setForm({ ...form, dominio: e.target.value })}
            required
            className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URL de la API</label>
        <input
          type="url"
          value={form.apiUrl}
          onChange={(e) => setForm({ ...form, apiUrl: e.target.value })}
          required
          className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Master Key</label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={form.masterKey}
            onChange={(e) => setForm({ ...form, masterKey: e.target.value })}
            required
            className="w-full h-11 px-3.5 pr-20 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            {showKey ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="flex items-center gap-2 px-5 h-10 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
      >
        <Save size={14} />
        {loading ? "Guardando..." : "Guardar configuración"}
      </button>
    </form>
  )
}
