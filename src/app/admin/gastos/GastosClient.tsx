"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  TrendingDown, Plus, X, FileText, ChevronDown,
  Loader2, Pencil, Trash2, Bot, Monitor, Server, Megaphone, Package,
} from "lucide-react"
import { toast } from "sonner"

// ─── Categorías ───────────────────────────────────────────────────────────────

type Categoria = "HERRAMIENTA_IA" | "SOFTWARE" | "INFRAESTRUCTURA" | "PUBLICIDAD" | "OTRO"

const CAT_META: Record<Categoria, {
  label: string
  badgeClass: string
  dotClass: string
  icon: React.ReactNode
}> = {
  HERRAMIENTA_IA:  { label: "IA",             badgeClass: "bg-violet-50 text-violet-700 border-violet-200",  dotClass: "bg-violet-500", icon: <Bot size={11} /> },
  SOFTWARE:        { label: "Software",        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",        dotClass: "bg-blue-500",   icon: <Monitor size={11} /> },
  INFRAESTRUCTURA: { label: "Infraestructura", badgeClass: "bg-slate-100 text-slate-700 border-slate-200",    dotClass: "bg-slate-500",  icon: <Server size={11} /> },
  PUBLICIDAD:      { label: "Publicidad",      badgeClass: "bg-orange-50 text-orange-700 border-orange-200",  dotClass: "bg-orange-500", icon: <Megaphone size={11} /> },
  OTRO:            { label: "Otro",            badgeClass: "bg-gray-100 text-gray-600 border-gray-200",       dotClass: "bg-gray-400",   icon: <Package size={11} /> },
}

function CategoriaBadge({ categoria }: { categoria: string }) {
  const meta = CAT_META[categoria as Categoria] ?? CAT_META.OTRO
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.badgeClass}`}>
      {meta.icon}{meta.label}
    </span>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GastoItem {
  id: string
  concepto: string
  categoria: string
  monto: number
  moneda: string
  fecha: string
  comprobante: string | null
  notas: string | null
  registradoPor: string
  registradoPorId: string
  custodioId: string | null
  custodioNombre: string
}

interface UsuarioBasic { id: string; nombre: string }

interface Props {
  gastos:        GastoItem[]
  usuarios:      UsuarioBasic[]
  currentUserId: string
  kpis: {
    totalEsteMes: number
    totalHistorico: number
    porCategoria: Record<string, number>
  }
  isAdmin: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n)
}
function formatMonto(monto: number, moneda: string) {
  if (moneda === "USD") return formatUSD(monto)
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda }).format(monto)
}
function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}
function todayISO() { return new Date().toISOString().split("T")[0] }

// ─── Formulario compartido ────────────────────────────────────────────────────

function FormGasto({
  initial,
  usuarios,
  currentUserId,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
  existingComprobante,
}: {
  initial: {
    concepto: string; categoria: Categoria; monto: string
    moneda: string; fecha: string; notas: string; custodioId: string
  }
  usuarios: UsuarioBasic[]
  currentUserId: string
  onSubmit: (data: FormData, file: File | null) => Promise<void>
  onCancel: () => void
  submitting: boolean
  submitLabel: string
  existingComprobante?: string | null
}) {
  const [form, setForm] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const fileRef         = useRef<HTMLInputElement>(null)

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.append("concepto",  form.concepto)
    fd.append("categoria", form.categoria)
    fd.append("monto",     form.monto)
    fd.append("moneda",    form.moneda)
    fd.append("fecha",     form.fecha)
    fd.append("notas",     form.notas)
    fd.append("custodioId", form.custodioId)
    if (file) fd.append("comprobante", file)
    await onSubmit(fd, file)
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      {/* Concepto */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Concepto *</label>
        <input
          type="text" value={form.concepto} onChange={e => set("concepto", e.target.value)}
          placeholder="Ej: Claude Max, Canva Pro, Dominio hypnosapps.com…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Categoría *</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(Object.keys(CAT_META) as Categoria[]).map(c => {
            const meta = CAT_META[c]
            const sel  = form.categoria === c
            return (
              <button key={c} type="button" onClick={() => set("categoria", c)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-medium transition-all ${
                  sel ? `${meta.badgeClass} border-current` : "border-gray-200 text-gray-500 hover:border-gray-300"
                }`}>
                {meta.icon}{meta.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Monto + moneda */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Monto *</label>
          <input type="number" min="0" step="0.01" value={form.monto} onChange={e => set("monto", e.target.value)}
            placeholder="0"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Moneda</label>
          <div className="relative">
            <select value={form.moneda} onChange={e => set("moneda", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8 bg-white">
              <option value="USD">USD</option>
              <option value="CLP">CLP</option>
              <option value="EUR">EUR</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Fecha */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha</label>
        <input type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Comprobante */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Comprobante {existingComprobante ? "(reemplazar)" : "(opcional)"}
        </label>
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
          onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          {file
            ? <p className="text-sm text-indigo-600 font-medium">{file.name}</p>
            : existingComprobante
            ? <p className="text-xs text-gray-400">Comprobante existente · click para reemplazar</p>
            : <p className="text-xs text-gray-400">PDF, JPG, PNG o WebP · máx 10 MB</p>}
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Notas (opcional)</label>
        <textarea rows={2} value={form.notas} onChange={e => set("notas", e.target.value)}
          placeholder="Observaciones internas…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>

      {/* Pagado por */}
      {usuarios.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Pagado por *</label>
          <div className="flex gap-2">
            {usuarios.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => set("custodioId", u.id)}
                className={[
                  "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all",
                  form.custodioId === u.id
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-500 hover:border-gray-300",
                ].join(" ")}
              >
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                  {u.nombre.charAt(0).toUpperCase()}
                </span>
                {u.nombre.split(" ")[0]}
                {u.id === currentUserId && <span className="text-xs text-gray-400">(yo)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={submitting}
          className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          {submitting ? <><Loader2 size={14} className="animate-spin" />{" "}Guardando…</> : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Modal Registrar ──────────────────────────────────────────────────────────

function ModalRegistrar({
  usuarios, currentUserId, onClose, onSuccess,
}: {
  usuarios: UsuarioBasic[]
  currentUserId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [submitting, setSub] = useState(false)

  async function handleSubmit(fd: FormData) {
    setSub(true)
    try {
      const res = await fetch("/api/gastos", { method: "POST", body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success("Gasto registrado")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el gasto")
    } finally { setSub(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Registrar gasto</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>
        <FormGasto
          initial={{ concepto: "", categoria: "HERRAMIENTA_IA", monto: "", moneda: "USD", fecha: todayISO(), notas: "", custodioId: currentUserId }}
          usuarios={usuarios}
          currentUserId={currentUserId}
          onSubmit={handleSubmit} onCancel={onClose}
          submitting={submitting} submitLabel="Registrar gasto"
        />
      </div>
    </div>
  )
}

// ─── Modal Editar ─────────────────────────────────────────────────────────────

function ModalEditar({
  gasto, usuarios, currentUserId, onClose, onSuccess,
}: {
  gasto: GastoItem
  usuarios: UsuarioBasic[]
  currentUserId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [submitting, setSub] = useState(false)

  async function handleSubmit(fd: FormData) {
    setSub(true)
    try {
      const res = await fetch(`/api/gastos/${gasto.id}`, { method: "PATCH", body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success("Gasto actualizado")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar")
    } finally { setSub(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Editar gasto</h2>
            <p className="text-xs text-gray-400 mt-0.5">{gasto.concepto}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>
        <FormGasto
          initial={{
            concepto: gasto.concepto, categoria: gasto.categoria as Categoria,
            monto: String(gasto.monto), moneda: gasto.moneda,
            fecha: gasto.fecha.split("T")[0], notas: gasto.notas ?? "",
            custodioId: gasto.custodioId ?? gasto.registradoPorId,
          }}
          usuarios={usuarios}
          currentUserId={currentUserId}
          onSubmit={handleSubmit} onCancel={onClose}
          submitting={submitting} submitLabel="Guardar cambios"
          existingComprobante={gasto.comprobante}
        />
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GastosClient({ gastos, usuarios, currentUserId, kpis, isAdmin }: Props) {
  const router = useRouter()
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editando,     setEditando]     = useState<GastoItem | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [filtroCat,    setFiltroCat]    = useState("todas")
  const [filtroMes,    setFiltroMes]    = useState("todos")
  const [pagina,       setPagina]       = useState(1)
  const PER_PAGE = 20

  const gastosFiltrados = gastos.filter(g => {
    if (filtroCat !== "todas" && g.categoria !== filtroCat) return false
    if (filtroMes !== "todos") {
      const d   = new Date(g.fecha)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      if (key !== filtroMes) return false
    }
    return true
  })

  const totalPaginas = Math.ceil(gastosFiltrados.length / PER_PAGE)
  const gastosPagina = gastosFiltrados.slice((pagina - 1) * PER_PAGE, pagina * PER_PAGE)

  const mesesUnicos = [...new Set(gastos.map(g => {
    const d = new Date(g.fecha)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  }))].sort((a, b) => b.localeCompare(a))

  function formatMesKey(key: string) {
    const [y, m] = key.split("-")
    const d = new Date(Number(y), Number(m) - 1, 1)
    const l = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    return l.charAt(0).toUpperCase() + l.slice(1)
  }

  async function eliminar(id: string) {
    if (!confirm("¿Eliminar este gasto?")) return
    setEliminandoId(id)
    try {
      const res = await fetch(`/api/gastos/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Gasto eliminado")
      router.refresh()
    } catch { toast.error("Error al eliminar") }
    finally { setEliminandoId(null) }
  }

  const toUSD = (m: number, mon: string) => mon === "CLP" ? m / 1000 : m

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gastos operativos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Herramientas, software e infraestructura</p>
        </div>
        <button onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          <Plus size={15} /> Registrar gasto
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={14} className="text-rose-400" />
            <p className="text-xs font-medium text-gray-500">Gastos este mes</p>
          </div>
          <p className="text-2xl font-bold text-rose-400">{formatUSD(kpis.totalEsteMes)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Total histórico</p>
          <p className="text-xl font-bold text-gray-800">{formatUSD(kpis.totalHistorico)}</p>
        </div>
        {/* Top categoría */}
        {(() => {
          const topCat = (Object.entries(kpis.porCategoria) as [string, number][])
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)[0]
          return topCat ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <p className="text-xs font-medium text-gray-500 mb-2">Mayor gasto (mes)</p>
              <CategoriaBadge categoria={topCat[0]} />
              <p className="text-lg font-bold text-gray-800 mt-1">{formatUSD(topCat[1])}</p>
            </div>
          ) : <div />
        })()}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">Registros totales</p>
          <p className="text-2xl font-bold text-gray-900">{gastos.length}</p>
        </div>
      </div>

      {/* Desglose por categoría — este mes */}
      {kpis.totalEsteMes > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Desglose este mes por categoría</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(Object.entries(CAT_META) as [Categoria, typeof CAT_META[Categoria]][]).map(([cat, meta]) => {
              const val = kpis.porCategoria[cat] ?? 0
              return (
                <div key={cat} className={`rounded-xl border p-3 ${val > 0 ? meta.badgeClass : "bg-gray-50 text-gray-400 border-gray-200"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {meta.icon}
                    <span className="text-xs font-medium">{meta.label}</span>
                  </div>
                  <p className="text-base font-bold">{val > 0 ? formatUSD(val) : "—"}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Filtros */}
        <div className="p-5 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-800 flex-1">
            Todos los gastos
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({gastosFiltrados.length} registro{gastosFiltrados.length !== 1 ? "s" : ""})
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {/* Filtro categoría */}
            <div className="relative">
              <select value={filtroCat} onChange={e => { setFiltroCat(e.target.value); setPagina(1) }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs appearance-none pr-7 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="todas">Toda categoría</option>
                {(Object.entries(CAT_META) as [Categoria, typeof CAT_META[Categoria]][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {/* Filtro mes */}
            <div className="relative">
              <select value={filtroMes} onChange={e => { setFiltroMes(e.target.value); setPagina(1) }}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs appearance-none pr-7 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="todos">Todos los meses</option>
                {mesesUnicos.map(m => <option key={m} value={m}>{formatMesKey(m)}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {gastosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <TrendingDown size={32} className="mx-auto mb-3 opacity-20" />
            No hay gastos con los filtros seleccionados
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Concepto</th>
                    <th className="px-5 py-3 text-left">Categoría</th>
                    <th className="px-5 py-3 text-right">Monto</th>
                    <th className="px-5 py-3 text-center">Comp.</th>
                    <th className="px-5 py-3 text-left">Pagado por</th>
                    {isAdmin && <th className="px-5 py-3 text-center">Acc.</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {gastosPagina.map(g => (
                    <tr key={g.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{formatFecha(g.fecha)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800">{g.concepto}</p>
                        {g.notas && <p className="text-xs text-gray-400 truncate max-w-xs">{g.notas}</p>}
                      </td>
                      <td className="px-5 py-3.5"><CategoriaBadge categoria={g.categoria} /></td>
                      <td className="px-5 py-3.5 text-right font-semibold text-rose-400">{formatMonto(g.monto, g.moneda)}</td>
                      <td className="px-5 py-3.5 text-center">
                        {g.comprobante ? (
                          <a href={`/api/gastos/${g.id}/comprobante`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                            <FileText size={13} />
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-medium text-gray-800">{g.custodioNombre}</td>
                      {isAdmin && (
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditando(g)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => eliminar(g.id)} disabled={eliminandoId === g.id}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40">
                              {eliminandoId === g.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden divide-y divide-gray-50">
              {gastosPagina.map(g => (
                <div key={g.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{g.concepto}</p>
                      <div className="mt-1"><CategoriaBadge categoria={g.categoria} /></div>
                    </div>
                    <p className="font-bold text-rose-400 text-sm shrink-0">{formatMonto(g.monto, g.moneda)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">{formatFecha(g.fecha)} · {g.custodioNombre}</p>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditando(g)} className="p-1 rounded text-indigo-400 hover:text-indigo-600"><Pencil size={13} /></button>
                        <button onClick={() => eliminar(g.id)} disabled={eliminandoId === g.id} className="p-1 rounded text-gray-300 hover:text-red-500 disabled:opacity-40">
                          {eliminandoId === g.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">Página {pagina} de {totalPaginas}</p>
                <div className="flex gap-1">
                  <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Anterior</button>
                  <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">Siguiente</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modales */}
      {modalOpen && (
        <ModalRegistrar
          usuarios={usuarios}
          currentUserId={currentUserId}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); router.refresh() }}
        />
      )}
      {editando && (
        <ModalEditar
          gasto={editando}
          usuarios={usuarios}
          currentUserId={currentUserId}
          onClose={() => setEditando(null)}
          onSuccess={() => { setEditando(null); router.refresh() }}
        />
      )}
    </div>
  )
}
