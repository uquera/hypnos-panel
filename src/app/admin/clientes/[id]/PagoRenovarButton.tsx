"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { Zap, X, ChevronDown, Loader2, FileText } from "lucide-react"
import { toast } from "sonner"

function getMesCompleto(offset = 0) {
  const d     = new Date()
  const inicio = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  const fin    = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)
  return {
    inicio: inicio.toISOString().split("T")[0],
    fin:    fin.toISOString().split("T")[0],
  }
}

function todayISO() { return new Date().toISOString().split("T")[0] }

export default function PagoRenovarButton({
  clienteId, clienteNombre,
}: {
  clienteId: string
  clienteNombre: string
}) {
  const router      = useRouter()
  const [open, setOpen] = useState(false)
  const mes = getMesCompleto(0)
  const [form, setForm] = useState({
    monto:         "",
    moneda:        "CLP",
    periodoInicio: mes.inicio,
    periodoFin:    mes.fin,
    fechaPago:     todayISO(),
    notas:         "",
  })
  const [file, setFile]     = useState<File | null>(null)
  const [loading, setLoad]  = useState(false)
  const fileRef             = useRef<HTMLInputElement>(null)

  function setMes(offset: number) {
    const m = getMesCompleto(offset)
    setForm(f => ({ ...f, periodoInicio: m.inicio, periodoFin: m.fin }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) {
      toast.error("Ingresa un monto válido")
      return
    }
    setLoad(true)
    try {
      const fd = new FormData()
      fd.append("monto",         form.monto)
      fd.append("moneda",        form.moneda)
      fd.append("periodoInicio", form.periodoInicio)
      fd.append("periodoFin",    form.periodoFin)
      fd.append("fechaPago",     form.fechaPago)
      fd.append("notas",         form.notas)
      if (file) fd.append("comprobante", file)

      const res  = await fetch(`/api/clientes/${clienteId}/pago-renovar`, { method: "POST", body: fd })
      const data = await res.json()

      if (res.ok) {
        const msg = data.syncedRemote
          ? `Pago registrado y licencia renovada hasta ${data.nuevaFecha} ✓`
          : `Pago registrado y renovado localmente (cliente sin conexión)`
        data.syncedRemote ? toast.success(msg) : toast.warning(msg)
        setOpen(false)
        router.refresh()
      } else {
        toast.error(data.error ?? "Error al procesar")
      }
    } catch {
      toast.error("Error de red")
    } finally {
      setLoad(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
        style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
        title="Registrar pago y renovar licencia en un solo paso"
      >
        <Zap size={14} />
        Pago + Renovar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Zap size={16} className="text-emerald-600" />
                  Pago + Renovar licencia
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Registra el pago y extiende +30 días en un solo paso · {clienteNombre}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Monto + moneda */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Monto *</label>
                  <input
                    type="number" min="0" step="1"
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Moneda</label>
                  <div className="relative">
                    <select
                      value={form.moneda}
                      onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 appearance-none pr-8 bg-white"
                    >
                      <option value="CLP">CLP</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Periodo */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Período cobrado</label>
                <div className="flex gap-1.5 mb-2">
                  {[["Este mes", 0], ["Mes anterior", -1]].map(([label, off]) => (
                    <button
                      key={String(label)} type="button"
                      onClick={() => setMes(Number(off))}
                      className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date" value={form.periodoInicio}
                    onChange={e => setForm(f => ({ ...f, periodoInicio: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="date" value={form.periodoFin}
                    onChange={e => setForm(f => ({ ...f, periodoFin: e.target.value }))}
                    className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Fecha pago */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha de pago</label>
                <input
                  type="date" value={form.fechaPago}
                  onChange={e => setForm(f => ({ ...f, fechaPago: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Comprobante */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Comprobante (opcional)</label>
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-emerald-400 transition-colors"
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef} type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={e => setFile(e.target.files?.[0] ?? null)}
                  />
                  {file
                    ? <p className="text-sm text-emerald-600 font-medium flex items-center justify-center gap-1"><FileText size={14} />{file.name}</p>
                    : <p className="text-xs text-gray-400">PDF, JPG, PNG o WebP · máx 10 MB</p>
                  }
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Notas (opcional)</label>
                <textarea
                  rows={2} value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Ej: Transferencia recibida el 02/05"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
              </div>

              {/* Info renovación */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-700">
                <strong>Renovación automática:</strong> la licencia se extenderá +30 días desde la fecha de vencimiento actual y se sincronizará con el cliente.
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button" onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
                >
                  {loading ? <><Loader2 size={14} className="animate-spin" /> Procesando…</> : <><Zap size={14} /> Registrar y renovar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
