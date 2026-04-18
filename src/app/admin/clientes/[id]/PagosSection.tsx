"use client"

import { useState, useEffect, useRef } from "react"
import {
  Plus, X, FileText, Trash2, Loader2, ChevronDown, ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PagoItem {
  id: string
  monto: number
  moneda: string
  periodoInicio: string
  periodoFin: string
  fechaPago: string
  comprobante: string | null
  notas: string | null
  createdAt: string
  registradoPor: { nombre: string }
}

interface Props {
  clienteId: string
  isAdmin: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMonto(monto: number, moneda: string): string {
  if (moneda === "CLP") {
    return new Intl.NumberFormat("es-CL", {
      style: "currency", currency: "CLP", maximumFractionDigits: 0,
    }).format(monto)
  }
  return new Intl.NumberFormat("es-CL", {
    style: "currency", currency: moneda,
  }).format(monto)
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function formatPeriodo(inicio: string, fin: string): string {
  const i = new Date(inicio.substring(0, 10) + "T12:00:00")
  const f = new Date(fin.substring(0, 10) + "T12:00:00")
  if (i.getFullYear() === f.getFullYear() && i.getMonth() === f.getMonth()) {
    const label = i.toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return (
    i.toLocaleDateString("es-CL", { day: "numeric", month: "short" }) +
    " – " +
    f.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
  )
}

function getMesCompleto(offset = 0) {
  const d = new Date()
  const inicio = new Date(d.getFullYear(), d.getMonth() + offset, 1)
  const fin    = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0)
  return {
    inicio: inicio.toISOString().split("T")[0],
    fin:    fin.toISOString().split("T")[0],
    label:  inicio.toLocaleDateString("es-CL", { month: "long", year: "numeric" }),
  }
}

function todayISO() {
  return new Date().toISOString().split("T")[0]
}

// ─── Component ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  monto: "",
  moneda: "CLP",
  periodoInicio: "",
  periodoFin: "",
  fechaPago: todayISO(),
  notas: "",
}

export default function PagosSection({ clienteId, isAdmin }: Props) {
  const [pagos, setPagos]         = useState<PagoItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [file, setFile]           = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Fetch list ───────────────────────────────────────────────────────────
  async function fetchPagos() {
    try {
      const res  = await fetch(`/api/clientes/${clienteId}/pagos`)
      const data = await res.json()
      setPagos(data.pagos ?? [])
    } catch {
      toast.error("No se pudo cargar el historial de pagos")
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => { fetchPagos() }, [clienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Submit new pago ──────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.periodoInicio || !form.periodoFin || !form.fechaPago) {
      toast.error("Completa todos los campos obligatorios")
      return
    }
    if (parseFloat(form.monto) <= 0 || isNaN(parseFloat(form.monto))) {
      toast.error("El monto debe ser mayor a 0")
      return
    }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append("monto", form.monto)
      fd.append("moneda", form.moneda)
      fd.append("periodoInicio", form.periodoInicio)
      fd.append("periodoFin", form.periodoFin)
      fd.append("fechaPago", form.fechaPago)
      if (form.notas) fd.append("notas", form.notas)
      if (file) fd.append("comprobante", file)

      const res = await fetch(`/api/clientes/${clienteId}/pagos`, {
        method: "POST",
        body: fd,
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? "Error al registrar el pago")
        return
      }

      setPagos((prev) => [data.pago, ...prev])
      setForm({ ...EMPTY_FORM, fechaPago: todayISO() })
      setFile(null)
      if (fileRef.current) fileRef.current.value = ""
      setShowForm(false)
      toast.success("Pago registrado correctamente")
    } catch {
      toast.error("Error de red al registrar el pago")
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete pago ──────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este pago? Esta acción no se puede deshacer.")) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/pagos/${id}`, { method: "DELETE" })
      if (res.ok) {
        setPagos((prev) => prev.filter((p) => p.id !== id))
        toast.success("Pago eliminado")
      } else {
        const data = await res.json()
        toast.error(data.error ?? "Error al eliminar")
      }
    } catch {
      toast.error("Error de red al eliminar")
    } finally {
      setDeletingId(null)
    }
  }

  // ── Period presets ───────────────────────────────────────────────────────
  function applyPeriodo(offset: number) {
    const { inicio, fin } = getMesCompleto(offset)
    setForm((f) => ({ ...f, periodoInicio: inicio, periodoFin: fin }))
  }

  const mesActual   = getMesCompleto(0)
  const mesAnterior = getMesCompleto(-1)

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Historial de pagos</h2>
          <p className="text-sm text-gray-500">Comprobantes y periodos cobrados</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          {showForm ? <X size={15} /> : <Plus size={15} />}
          <span className="hidden sm:inline">{showForm ? "Cancelar" : "Registrar pago"}</span>
          <span className="sm:hidden">{showForm ? "Cancelar" : "Registrar"}</span>
        </button>
      </div>

      {/* ── Form ──────────────────────────────────────────────────────────── */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="border border-indigo-100 rounded-xl p-4 space-y-4 bg-indigo-50/30"
        >
          {/* Monto + Moneda */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-1 sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Monto <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                placeholder="25000"
                required
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Moneda</label>
              <select
                value={form.moneda}
                onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              >
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Periodo */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Periodo cobrado <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => applyPeriodo(0)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all capitalize"
              >
                {mesActual.label}
              </button>
              <button
                type="button"
                onClick={() => applyPeriodo(-1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-all capitalize"
              >
                {mesAnterior.label}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Desde</p>
                <input
                  type="date"
                  value={form.periodoInicio}
                  onChange={(e) => setForm({ ...form, periodoInicio: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400">Hasta</p>
                <input
                  type="date"
                  value={form.periodoFin}
                  onChange={(e) => setForm({ ...form, periodoFin: e.target.value })}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Fecha de pago */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Fecha de pago <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={form.fechaPago}
              onChange={(e) => setForm({ ...form, fechaPago: e.target.value })}
              required
              className="w-full sm:w-48 h-10 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Comprobante */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Comprobante <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <div
              className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-300 bg-white cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileText size={16} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-500 truncate">
                {file ? file.name : "PDF, JPEG, PNG o WebP — máx. 10 MB"}
              </span>
              {file && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = "" }}
                  className="ml-auto text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Notas <span className="text-gray-400 font-normal normal-case">(opcional)</span>
            </label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              rows={2}
              placeholder="Ej: Pagó con transferencia bancaria el 15/04."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto h-10 px-6 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
          >
            {submitting
              ? <><Loader2 size={15} className="animate-spin" /> Registrando...</>
              : "Registrar pago"
            }
          </button>
        </form>
      )}

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {loadingList ? (
        <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Cargando historial...</span>
        </div>
      ) : pagos.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <ChevronDown size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sin pagos registrados aún</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left pb-2 pr-4">Periodo</th>
                  <th className="text-left pb-2 pr-4">Fecha pago</th>
                  <th className="text-right pb-2 pr-4">Monto</th>
                  <th className="text-left pb-2 pr-4">Comprobante</th>
                  <th className="text-left pb-2 pr-4">Registrado por</th>
                  {isAdmin && <th className="pb-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagos.map((p) => (
                  <tr key={p.id} className="group hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 pr-4 font-medium text-gray-800">{formatPeriodo(p.periodoInicio, p.periodoFin)}</td>
                    <td className="py-3 pr-4 text-gray-500">{formatFecha(p.fechaPago)}</td>
                    <td className="py-3 pr-4 text-right font-semibold text-gray-800">{formatMonto(p.monto, p.moneda)}</td>
                    <td className="py-3 pr-4">
                      {p.comprobante ? (
                        <a
                          href={`/api/pagos/${p.id}/comprobante`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                        >
                          <FileText size={13} />
                          Ver
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-gray-400 text-xs">{p.registradoPor.nombre}</td>
                    {isAdmin && (
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          {deletingId === p.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Trash2 size={14} />
                          }
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {pagos.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-100 p-3.5 bg-gray-50/50">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{formatPeriodo(p.periodoInicio, p.periodoFin)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatFecha(p.fechaPago)}</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 shrink-0">{formatMonto(p.monto, p.moneda)}</p>
                </div>
                <div className="flex items-center gap-3 mt-2.5">
                  {p.comprobante && (
                    <a
                      href={`/api/pagos/${p.id}/comprobante`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 text-xs font-medium"
                    >
                      <FileText size={12} />
                      Comprobante
                      <ExternalLink size={10} />
                    </a>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">{p.registradoPor.nombre}</span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      {deletingId === p.id
                        ? <Loader2 size={13} className="animate-spin" />
                        : <Trash2 size={13} />
                      }
                    </button>
                  )}
                </div>
                {p.notas && <p className="text-xs text-gray-400 mt-2 italic">{p.notas}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
