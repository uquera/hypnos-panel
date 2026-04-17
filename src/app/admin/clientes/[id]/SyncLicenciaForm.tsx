"use client"

import { useState } from "react"
import { syncLicencia } from "@/lib/licencia-sync"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"

interface Props {
  clienteId:        string
  dominio:          string
  plan:             string
  fechaVencimiento: string    // YYYY-MM-DD
  suspendida:       boolean
  notasAdmin:       string
}

const PRESETS = [
  { label: "7 días",  days: 7  },
  { label: "15 días", days: 15 },
  { label: "1 mes",   days: 30 },
  { label: "3 meses", days: 90 },
]

function addDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export default function SyncLicenciaForm({
  clienteId, dominio, plan, fechaVencimiento, suspendida, notasAdmin,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ plan, fechaVencimiento, suspendida, notasAdmin })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await syncLicencia(clienteId, {
        plan:             form.plan,
        fechaVencimiento: form.fechaVencimiento,
        suspendida:       form.suspendida,
        notasAdmin:       form.notasAdmin,
      })
      if (result.syncedRemote) {
        toast.success(`Licencia sincronizada con ${dominio}`)
      } else if (result.ok) {
        toast.warning(result.error ?? `Guardado local. No se pudo sincronizar con ${dominio}`)
      } else {
        toast.error("Error al guardar la licencia")
      }
    } catch {
      toast.error("Error inesperado")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Plan */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Plan</label>
          <select
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value })}
            className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          >
            <option value="BASICO">BASICO</option>
            <option value="PRO">PRO</option>
            <option value="ENTERPRISE">ENTERPRISE</option>
          </select>
        </div>

        {/* Fecha + accesos rápidos */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimiento</label>
          <input
            type="date"
            value={form.fechaVencimiento}
            onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })}
            required
            className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Botones de acceso rápido */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acceso rápido — desde hoy</p>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map(({ label, days }) => {
            const targetDate = addDaysFromToday(days)
            const isActive   = form.fechaVencimiento === targetDate
            return (
              <button
                key={days}
                type="button"
                onClick={() => setForm({ ...form, fechaVencimiento: targetDate, suspendida: false })}
                className={[
                  "px-4 py-2 rounded-xl text-sm font-semibold border transition-all",
                  isActive
                    ? "text-white border-transparent shadow-sm"
                    : "text-gray-600 border-gray-200 bg-white hover:border-indigo-300 hover:text-indigo-600",
                ].join(" ")}
                style={isActive ? { background: "linear-gradient(135deg, #6366f1, #4f46e5)" } : undefined}
              >
                {label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-400">
          Vence el{" "}
          <span className="font-semibold text-gray-600">
            {new Date(form.fechaVencimiento + "T12:00:00").toLocaleDateString("es-CL", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </span>
        </p>
      </div>

      {/* Suspendida toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
        <div>
          <p className="text-sm font-semibold text-gray-700">Cuenta suspendida</p>
          <p className="text-xs text-gray-400">Los usuarios del cliente no podrán iniciar sesión</p>
        </div>
        <button
          type="button"
          onClick={() => setForm({ ...form, suspendida: !form.suspendida })}
          className={[
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
            form.suspendida ? "bg-red-500" : "bg-gray-200",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              form.suspendida ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>

      {/* Notas */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notas internas</label>
        <textarea
          value={form.notasAdmin}
          onChange={(e) => setForm({ ...form, notasAdmin: e.target.value })}
          rows={3}
          placeholder="Ej: Pagó con transferencia el 17/04."
          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
      >
        {loading
          ? <><RefreshCw size={15} className="animate-spin" /> Sincronizando...</>
          : <><RefreshCw size={15} /> Guardar y sincronizar con cliente</>
        }
      </button>
    </form>
  )
}
