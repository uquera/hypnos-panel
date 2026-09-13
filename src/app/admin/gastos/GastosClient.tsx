"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  TrendingDown, Plus, X, FileText, ChevronDown, ChevronUp, ArrowUpDown,
  Loader2, Pencil, Trash2, Bot, Monitor, Server, Megaphone, Package,
} from "lucide-react"
import { toast } from "sonner"

type SortKey = "fecha" | "concepto" | "categoria" | "monto" | "custodioNombre"

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

// ─── Gráficos (SVG/CSS, sin librerías) ─────────────────────────────────────────

type Seg = { label: string; value: number; color: string }

function Donut({ segments }: { segments: Seg[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const R = 42, C = 2 * Math.PI * R
  let acc = 0
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * C
          const el = (
            <circle key={i} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
          )
          acc += len
          return el
        })}
      </svg>
      <ul className="flex-1 space-y-1.5 min-w-0">
        {segments.map((s, i) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
          return (
            <li key={i} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
              <span className="text-gray-600 truncate flex-1">{s.label}</span>
              <span className="font-semibold text-gray-800">{formatUSD(s.value)}</span>
              <span className="text-gray-400 w-9 text-right">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Curva suave (Catmull-Rom → Bézier) para la línea de tendencia
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return ""
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  const p = points
  let d = `M ${p[0].x} ${p[0].y}`
  const t = 0.18
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) * t
    const c1y = p1.y + (p2.y - p0.y) * t
    const c2x = p2.x - (p3.x - p1.x) * t
    const c2y = p2.y - (p3.y - p1.y) * t
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

function GastosMesChart({ meses, mesActualKey }: { meses: { key: string; label: string; total: number }[]; mesActualKey: string }) {
  const [tip, setTip] = useState<number | null>(null)
  const maxVal = Math.max(...meses.map(m => m.total), 1)
  const n = meses.length
  const pts = meses.map((m, i) => ({ x: i + 0.5, y: 100 - (m.total / maxVal) * 100 }))
  const linePath = smoothPath(pts)

  return (
    <div className="relative">
      <div className="relative" style={{ height: "170px" }}>
        {/* Barras (sin gap: cada celda flex-1 centra su barra → alinea con la línea) */}
        <div className="flex items-end h-full">
          {meses.map((m, i) => {
            const isActual = m.key === mesActualKey
            const pct = (m.total / maxVal) * 100
            return (
              <div key={m.key} className="flex-1 flex items-end justify-center h-full cursor-pointer"
                onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}>
                <div className="w-full max-w-[20px] rounded-t-md transition-all"
                  style={{
                    height: `${Math.max(pct, m.total > 0 ? 2 : 0)}%`,
                    background: isActual ? "#f43f5e" : "#fecdd3",
                    minHeight: m.total > 0 ? "2px" : "0",
                  }} />
              </div>
            )
          })}
        </div>
        {/* Línea de tendencia (curva) */}
        <svg viewBox={`0 0 ${n} 100`} preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
          <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2"
            vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* Puntos sobre la línea */}
        <div className="absolute inset-0 pointer-events-none">
          {pts.map((p, i) => (
            <span key={i} className="absolute w-1.5 h-1.5 rounded-full bg-indigo-500 ring-2 ring-white -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${(p.x / n) * 100}%`, top: `${p.y}%` }} />
          ))}
        </div>
      </div>
      {/* Etiquetas de mes */}
      <div className="flex mt-1.5">
        {meses.map(m => (
          <span key={m.key} className="flex-1 text-center text-[9px] text-gray-400 leading-none capitalize truncate px-0.5">{m.label}</span>
        ))}
      </div>
      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#fecdd3" }} />Gasto mensual</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-[3px] rounded-full" style={{ background: "#6366f1" }} />Tendencia</span>
      </div>
      {tip !== null && (
        <div className="absolute -top-1 pointer-events-none z-10 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: `${((tip + 0.5) / n) * 100}%`, transform: "translateX(-50%)" }}>
          <span className="font-semibold capitalize">{meses[tip].label}:</span> {formatUSD(meses[tip].total)}
        </div>
      )}
    </div>
  )
}

function IngresoGastoChart({ data }: { data: { nombre: string; ingreso: number; gasto: number }[] }) {
  const [tip, setTip] = useState<number | null>(null)
  if (!data.length) return <p className="text-sm text-gray-400 py-8 text-center">Sin datos en este período</p>
  const max = Math.max(...data.flatMap(d => [d.ingreso, d.gasto]), 1)
  return (
    <div className="relative">
      <div className="flex items-end gap-4 h-44">
        {data.map((d, i) => {
          const ip = (d.ingreso / max) * 100, gp = (d.gasto / max) * 100
          return (
            <div key={d.nombre} className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
              onMouseEnter={() => setTip(i)} onMouseLeave={() => setTip(null)}>
              <div className="w-full flex items-end justify-center gap-1" style={{ height: "150px" }}>
                <div className="flex-1 max-w-[26px] rounded-t-md transition-all" style={{ height: `${Math.max(ip, d.ingreso > 0 ? 2 : 0)}%`, background: "#10b981", minHeight: d.ingreso > 0 ? "2px" : "0" }} />
                <div className="flex-1 max-w-[26px] rounded-t-md transition-all" style={{ height: `${Math.max(gp, d.gasto > 0 ? 2 : 0)}%`, background: "#f43f5e", minHeight: d.gasto > 0 ? "2px" : "0" }} />
              </div>
              <span className="text-[11px] text-gray-500 leading-tight text-center truncate w-full">{d.nombre.split(" ")[0]}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500" />Ingresos</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-500" />Gastos</span>
      </div>
      {tip !== null && (
        <div className="absolute -top-1 pointer-events-none z-10 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: `${((tip + 0.5) / data.length) * 100}%`, transform: "translateX(-50%)" }}>
          <p className="font-semibold mb-0.5">{data[tip].nombre}</p>
          <p className="text-emerald-300">Ingresos: {formatUSD(data[tip].ingreso)}</p>
          <p className="text-rose-300">Gastos: {formatUSD(data[tip].gasto)}</p>
          <p className="border-t border-gray-700 mt-1 pt-1 font-semibold">Neto: {formatUSD(data[tip].ingreso - data[tip].gasto)}</p>
        </div>
      )}
    </div>
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

interface IngresoItem {
  monto:               number
  moneda:              string
  fecha:               string
  clienteNombre:       string
  registradoPorNombre: string
  custodias:           { nombre: string; monto: number }[]
}

interface Props {
  gastos:        GastoItem[]
  ingresos:      IngresoItem[]
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

export default function GastosClient({ gastos, ingresos, usuarios, currentUserId, kpis, isAdmin }: Props) {
  const router = useRouter()
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editando,     setEditando]     = useState<GastoItem | null>(null)
  const [eliminandoId, setEliminandoId] = useState<string | null>(null)
  const [filtroCat,    setFiltroCat]    = useState("todas")
  const [filtroMes,    setFiltroMes]    = useState("todos")
  const [chartScope,   setChartScope]   = useState<"mes" | "todo">("mes")
  const [pagina,       setPagina]       = useState(1)
  const [sortKey,      setSortKey]      = useState<SortKey>("fecha")
  const [sortDir,      setSortDir]      = useState<"asc" | "desc">("desc")
  const PER_PAGE = 20

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      // fecha y monto arrancan de mayor a menor; el texto, alfabético
      setSortDir(key === "fecha" || key === "monto" ? "desc" : "asc")
    }
    setPagina(1)
  }

  const gastosFiltrados = gastos.filter(g => {
    if (filtroCat !== "todas" && g.categoria !== filtroCat) return false
    if (filtroMes !== "todos") {
      const d   = new Date(g.fecha)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
      if (key !== filtroMes) return false
    }
    return true
  })

  const montoUSD = (m: number, mon: string) => (mon === "CLP" ? m / 1000 : m)
  const gastosOrdenados = [...gastosFiltrados].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case "fecha":          cmp = a.fecha.localeCompare(b.fecha); break
      case "concepto":       cmp = a.concepto.localeCompare(b.concepto, "es"); break
      case "categoria":      cmp = a.categoria.localeCompare(b.categoria, "es"); break
      case "monto":          cmp = montoUSD(a.monto, a.moneda) - montoUSD(b.monto, b.moneda); break
      case "custodioNombre": cmp = a.custodioNombre.localeCompare(b.custodioNombre, "es"); break
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  const totalPaginas = Math.ceil(gastosOrdenados.length / PER_PAGE)
  const gastosPagina = gastosOrdenados.slice((pagina - 1) * PER_PAGE, pagina * PER_PAGE)

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

  // ── Datos para gráficos (todo en USD para comparar) ──
  const keyDe = (iso: string) => {
    const d = new Date(iso)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  }
  const ahora = new Date()
  const mesActualKey = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, "0")}`
  const ultimos12 = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - (11 - i), 1))
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
    return { key, label: d.toLocaleDateString("es-CL", { month: "short", timeZone: "UTC" }), total: 0 }
  })
  gastos.forEach(g => {
    const b = ultimos12.find(x => x.key === keyDe(g.fecha))
    if (b) b.total += toUSD(g.monto, g.moneda)
  })

  const enScope = (g: GastoItem) => chartScope === "todo" || keyDe(g.fecha) === mesActualKey
  const personaMap = new Map<string, number>()
  const catMap = new Map<string, number>()
  gastos.forEach(g => {
    if (!enScope(g)) return
    const v = toUSD(g.monto, g.moneda)
    personaMap.set(g.custodioNombre, (personaMap.get(g.custodioNombre) ?? 0) + v)
    catMap.set(g.categoria, (catMap.get(g.categoria) ?? 0) + v)
  })
  const PERSONA_COLORS = ["#6366f1", "#f43f5e", "#10b981", "#f59e0b", "#06b6d4", "#a855f7", "#84cc16"]
  const CAT_HEX: Record<string, string> = {
    HERRAMIENTA_IA: "#8b5cf6", SOFTWARE: "#3b82f6", INFRAESTRUCTURA: "#64748b", PUBLICIDAD: "#f97316", OTRO: "#9ca3af",
  }
  const catSeg: Seg[] = [...catMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([cat, value]) => ({ label: CAT_META[cat as Categoria]?.label ?? cat, value, color: CAT_HEX[cat] ?? "#9ca3af" }))

  // ── Ingresos: por cliente (dona) y por persona (custodio) para comparar con gastos ──
  const inScope = (iso: string) => chartScope === "todo" || keyDe(iso) === mesActualKey
  const clienteMap = new Map<string, number>()
  const ingPersonaMap = new Map<string, number>()
  ingresos.forEach(p => {
    if (!inScope(p.fecha)) return
    clienteMap.set(p.clienteNombre, (clienteMap.get(p.clienteNombre) ?? 0) + toUSD(p.monto, p.moneda))
    if (p.custodias.length > 0) {
      p.custodias.forEach(c => ingPersonaMap.set(c.nombre, (ingPersonaMap.get(c.nombre) ?? 0) + toUSD(c.monto, p.moneda)))
    } else {
      ingPersonaMap.set(p.registradoPorNombre, (ingPersonaMap.get(p.registradoPorNombre) ?? 0) + toUSD(p.monto, p.moneda))
    }
  })
  const CLIENTE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#06b6d4", "#a855f7", "#f43f5e", "#84cc16", "#ec4899"]
  const clienteSeg: Seg[] = [...clienteMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: CLIENTE_COLORS[i % CLIENTE_COLORS.length] }))

  const personasSet = new Set<string>([...ingPersonaMap.keys(), ...personaMap.keys()])
  const ingresoVsGasto = [...personasSet]
    .map(nombre => ({ nombre, ingreso: ingPersonaMap.get(nombre) ?? 0, gasto: personaMap.get(nombre) ?? 0 }))
    .sort((a, b) => (b.ingreso + b.gasto) - (a.ingreso + a.gasto))

  // Color estable por persona: mismo color en "gastos" e "ingresos"
  const personaNombres = [...personasSet]
  const personaColor = (n: string) => PERSONA_COLORS[Math.max(0, personaNombres.indexOf(n)) % PERSONA_COLORS.length]
  const personaSeg: Seg[] = [...personaMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: personaColor(label) }))
  const ingPersonaSeg: Seg[] = [...ingPersonaMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: personaColor(label) }))

  const thBtn = (k: SortKey, label: string, align: "left" | "right" | "center" = "left") => {
    const active   = sortKey === k
    const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
    const justify  = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start"
    return (
      <th className={`px-5 py-3 ${alignCls}`}>
        <button type="button" onClick={() => toggleSort(k)} title="Ordenar"
          className={`inline-flex items-center gap-1 w-full ${justify} uppercase tracking-wide font-semibold transition-colors ${active ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}>
          <span>{label}</span>
          {active
            ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
            : <ArrowUpDown size={11} className="opacity-30" />}
        </button>
      </th>
    )
  }

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

      {/* Análisis visual */}
      <div className="space-y-4">
        {/* Barras por mes + tendencia */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Gastos por mes — últimos 12 meses</h2>
          <GastosMesChart meses={ultimos12} mesActualKey={mesActualKey} />
        </div>

        {/* Selector de período (afecta las tarjetas de abajo) */}
        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
            {([["mes", "Este mes"], ["todo", "Todo el tiempo"]] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setChartScope(val)}
                className={`px-3 py-1.5 rounded-md transition-colors ${chartScope === val ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ingresos vs Gastos por persona */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Ingresos vs Gastos por persona</h2>
          <IngresoGastoChart data={ingresoVsGasto} />
        </div>

        {/* Tortas — 2×2: gastos (izq) vs ingresos (der) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Quién gastó más</h2>
            {personaSeg.length
              ? <Donut segments={personaSeg} />
              : <p className="text-sm text-gray-400 py-8 text-center">Sin gastos en este período</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Ingresos por persona</h2>
            {ingPersonaSeg.length
              ? <Donut segments={ingPersonaSeg} />
              : <p className="text-sm text-gray-400 py-8 text-center">Sin ingresos en este período</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Gastos por categoría</h2>
            {catSeg.length
              ? <Donut segments={catSeg} />
              : <p className="text-sm text-gray-400 py-8 text-center">Sin gastos en este período</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Ingresos por cliente</h2>
            {clienteSeg.length
              ? <Donut segments={clienteSeg} />
              : <p className="text-sm text-gray-400 py-8 text-center">Sin ingresos en este período</p>}
          </div>
        </div>
      </div>

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
                    {thBtn("fecha", "Fecha")}
                    {thBtn("concepto", "Concepto")}
                    {thBtn("categoria", "Categoría")}
                    {thBtn("monto", "Monto", "right")}
                    <th className="px-5 py-3 text-center">Comp.</th>
                    {thBtn("custodioNombre", "Pagado por")}
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
