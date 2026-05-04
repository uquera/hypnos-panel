"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  CreditCard, TrendingUp, TrendingDown, Minus, Users, AlertTriangle,
  Plus, X, FileText, Download, ChevronDown, Loader2,
} from "lucide-react"
import { toast } from "sonner"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PagoItem {
  id: string
  clienteId: string
  clienteNombre: string
  clienteDominio: string
  monto: number
  moneda: string
  periodoInicio: string
  periodoFin: string
  fechaPago: string
  comprobante: string | null
  notas: string | null
  registradoPor: string
}

interface ClienteBasic { id: string; nombre: string }

interface ChartMonth { label: string; key: string; total: number }

interface KPIs {
  totalEsteMes: number
  totalMesAnterior: number
  variacionPct: number | null
  totalHistorico: number
  clientesActivos: number
  clientesPorVencer: number
}

interface Props {
  pagos:                   PagoItem[]
  clientes:                ClienteBasic[]
  clientesSinPagoReciente: { id: string; nombre: string; diasRestantes: number }[]
  chartMonths:             ChartMonth[]
  mesActualKey:            string
  kpis:                    KPIs
  isAdmin:                 boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function formatMonto(monto: number, moneda: string) {
  if (moneda === "USD") return formatUSD(monto)
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda }).format(monto)
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  })
}

function formatPeriodo(inicio: string, fin: string) {
  const i = new Date(inicio)
  const f = new Date(fin)
  if (i.getUTCFullYear() === f.getUTCFullYear() && i.getUTCMonth() === f.getUTCMonth()) {
    const label = i.toLocaleDateString("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  return (
    i.toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" }) +
    " – " +
    f.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
  )
}

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

// ─── Bar Chart ────────────────────────────────────────────────────────────────

function BarChart({ months, mesActualKey }: { months: ChartMonth[]; mesActualKey: string }) {
  const [tooltip, setTooltip] = useState<{ idx: number; x: number; y: number } | null>(null)
  const max = Math.max(...months.map(m => m.total), 1)

  return (
    <div className="relative">
      <div className="flex items-end gap-1.5 h-40">
        {months.map((m, i) => {
          const pct = max > 0 ? (m.total / max) * 100 : 0
          const isActual = m.key === mesActualKey
          return (
            <div
              key={m.key}
              className="flex-1 flex flex-col items-center gap-1 cursor-pointer group"
              onMouseEnter={(e) => setTooltip({ idx: i, x: e.currentTarget.getBoundingClientRect().left, y: 0 })}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className="w-full flex flex-col justify-end" style={{ height: "128px" }}>
                <div
                  className={`w-full rounded-t-sm transition-all ${isActual ? "opacity-100" : "opacity-60 group-hover:opacity-90"}`}
                  style={{
                    height: `${Math.max(pct, m.total > 0 ? 4 : 0)}%`,
                    background: isActual
                      ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                      : "linear-gradient(135deg, #a5b4fc, #818cf8)",
                    minHeight: m.total > 0 ? "4px" : "0",
                  }}
                />
              </div>
              <span className="text-[9px] text-gray-400 truncate w-full text-center leading-none">
                {m.label}
              </span>
            </div>
          )
        })}
      </div>
      {tooltip !== null && (
        <div
          className="absolute -top-10 pointer-events-none z-10 bg-gray-900 text-white text-xs px-2 py-1 rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: `${(tooltip.idx / months.length) * 100}%`, transform: "translateX(-50%)" }}
        >
          {months[tooltip.idx].total > 0 ? formatUSD(months[tooltip.idx].total) : "Sin pagos"}
        </div>
      )}
    </div>
  )
}

// ─── Modal Registrar Pago ─────────────────────────────────────────────────────

function ModalRegistrarPago({
  clientes,
  clientePreseleccionado,
  onClose,
  onSuccess,
}: {
  clientes: ClienteBasic[]
  clientePreseleccionado?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const mes = getMesCompleto(0)
  const [form, setForm] = useState({
    clienteId:    clientePreseleccionado ?? (clientes[0]?.id ?? ""),
    monto:        "",
    moneda:       "USD",
    periodoInicio: mes.inicio,
    periodoFin:    mes.fin,
    fechaPago:     todayISO(),
    notas:         "",
  })
  const [file, setFile]         = useState<File | null>(null)
  const [submitting, setSub]    = useState(false)
  const fileRef                 = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clienteId || !form.monto || Number(form.monto) <= 0) {
      toast.error("Completa todos los campos obligatorios")
      return
    }
    setSub(true)
    try {
      const fd = new FormData()
      fd.append("monto",        form.monto)
      fd.append("moneda",       form.moneda)
      fd.append("periodoInicio", form.periodoInicio)
      fd.append("periodoFin",   form.periodoFin)
      fd.append("fechaPago",    form.fechaPago)
      fd.append("notas",        form.notas)
      if (file) fd.append("comprobante", file)

      const res = await fetch(`/api/clientes/${form.clienteId}/pagos`, { method: "POST", body: fd })
      if (!res.ok) throw new Error()
      const { syncedRemote } = await res.json()
      toast.success(syncedRemote ? "Pago registrado y sincronizado" : "Pago registrado (cliente sin conexión)")
      onSuccess()
    } catch {
      toast.error("Error al registrar el pago")
    } finally {
      setSub(false)
    }
  }

  function setMes(offset: number) {
    const m = getMesCompleto(offset)
    setForm(f => ({ ...f, periodoInicio: m.inicio, periodoFin: m.fin }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Registrar pago</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Cliente */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cliente *</label>
            <div className="relative">
              <select
                value={form.clienteId}
                onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8 bg-white"
              >
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Monto + moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Monto *</label>
              <input
                type="number" min="0" step="1"
                value={form.monto}
                onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Moneda</label>
              <div className="relative">
                <select
                  value={form.moneda}
                  onChange={e => setForm(f => ({ ...f, moneda: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8 bg-white"
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
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Período</label>
            <div className="flex gap-1.5 mb-2">
              {[["Este mes", 0], ["Mes anterior", -1]].map(([label, offset]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMes(Number(offset))}
                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date" value={form.periodoInicio}
                onChange={e => setForm(f => ({ ...f, periodoInicio: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="date" value={form.periodoFin}
                onChange={e => setForm(f => ({ ...f, periodoFin: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Fecha de pago */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha de pago</label>
            <input
              type="date" value={form.fechaPago}
              onChange={e => setForm(f => ({ ...f, fechaPago: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Comprobante */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Comprobante (opcional)</label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef} type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <p className="text-sm text-indigo-600 font-medium">{file.name}</p>
              ) : (
                <p className="text-xs text-gray-400">PDF, JPG, PNG o WebP · máx 10 MB</p>
              )}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notas (opcional)</label>
            <textarea
              rows={2}
              value={form.notas}
              onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Observaciones internas..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
            >
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : "Registrar pago"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PagosClient({
  pagos, clientes, clientesSinPagoReciente, chartMonths, mesActualKey, kpis, isAdmin,
}: Props) {
  const router = useRouter()
  const [filtroCliente, setFiltroCliente] = useState("todos")
  const [filtroMes,     setFiltroMes]     = useState("todos")
  const [filtroMoneda,  setFiltroMoneda]  = useState("todas")
  const [pagina,        setPagina]        = useState(1)
  const [modalOpen,     setModalOpen]     = useState(false)
  const [clientePre,    setClientePre]    = useState<string | undefined>()
  const [exportando,    setExportando]    = useState(false)
  const PER_PAGE = 20

  // Filtrado
  const pagosFiltrados = pagos.filter(p => {
    if (filtroCliente !== "todos" && p.clienteId !== filtroCliente) return false
    if (filtroMoneda  !== "todas" && p.moneda    !== filtroMoneda)  return false
    if (filtroMes     !== "todos") {
      const fp = new Date(p.fechaPago)
      const key = `${fp.getFullYear()}-${String(fp.getMonth() + 1).padStart(2, "0")}`
      if (key !== filtroMes) return false
    }
    return true
  })

  const totalPaginas = Math.ceil(pagosFiltrados.length / PER_PAGE)
  const pagosPagina  = pagosFiltrados.slice((pagina - 1) * PER_PAGE, pagina * PER_PAGE)

  // Meses únicos para el filtro
  const mesesUnicos = [...new Set(pagos.map(p => {
    const d = new Date(p.fechaPago)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }))].sort((a, b) => b.localeCompare(a))

  function formatMesKey(key: string) {
    const [year, month] = key.split("-")
    const d = new Date(Number(year), Number(month) - 1, 1)
    const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  function abrirModal(clienteId?: string) {
    setClientePre(clienteId)
    setModalOpen(true)
  }

  async function exportarCSV() {
    setExportando(true)
    try {
      const params = new URLSearchParams()
      if (filtroCliente !== "todos") params.set("clienteId", filtroCliente)
      if (filtroMes     !== "todos") {
        const [year, month] = filtroMes.split("-")
        const inicio = new Date(Number(year), Number(month) - 1, 1)
        const fin    = new Date(Number(year), Number(month), 0)
        params.set("desde", inicio.toISOString().split("T")[0])
        params.set("hasta", fin.toISOString().split("T")[0])
      }
      const res = await fetch(`/api/pagos/exportar?${params}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href = url
      a.download = `pagos-hypnos-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("CSV exportado correctamente")
    } catch {
      toast.error("Error al exportar")
    } finally {
      setExportando(false)
    }
  }

  const variacion = kpis.variacionPct
  const VariacionIcon = variacion === null ? Minus : variacion > 0 ? TrendingUp : TrendingDown
  const variacionColor = variacion === null ? "text-gray-400" : variacion > 0 ? "text-emerald-600" : "text-red-500"

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pagos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión centralizada de ingresos por membresías</p>
        </div>
        <button
          onClick={() => abrirModal()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          <Plus size={15} />
          Registrar pago
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Ingresado este mes</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatUSD(kpis.totalEsteMes)}</p>
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${variacionColor}`}>
            <VariacionIcon size={12} />
            {variacion === null ? "Sin referencia" : `${variacion > 0 ? "+" : ""}${variacion}% vs mes anterior`}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Mes anterior</p>
          <p className="text-xl font-bold text-gray-700 mt-1">{formatUSD(kpis.totalMesAnterior)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium">Total histórico</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{formatUSD(kpis.totalHistorico)}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <Users size={16} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Clientes activos</p>
            <p className="text-2xl font-bold text-gray-900">{kpis.clientesActivos}</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">Por vencer (&lt;30d)</p>
            <p className={`text-2xl font-bold ${kpis.clientesPorVencer > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {kpis.clientesPorVencer}
            </p>
          </div>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800">Ingresos CLP — últimos 12 meses</h2>
          <span className="text-xs text-gray-400">Solo pagos en USD</span>
        </div>
        <BarChart months={chartMonths} mesActualKey={mesActualKey} />
      </div>

      {/* Clientes por cobrar */}
      {clientesSinPagoReciente.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">
              Clientes por cobrar ({clientesSinPagoReciente.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {clientesSinPagoReciente.map(c => (
              <div key={c.id} className="bg-white rounded-xl border border-amber-200 p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.nombre}</p>
                  <p className={`text-xs font-medium ${c.diasRestantes <= 7 ? "text-red-500" : "text-amber-600"}`}>
                    Vence en {c.diasRestantes} día{c.diasRestantes !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  onClick={() => abrirModal(c.id)}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-200 flex items-center gap-1"
                >
                  <Plus size={11} /> Pago
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de pagos */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Header tabla */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800 flex-1">
              Todos los pagos
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({pagosFiltrados.length} registro{pagosFiltrados.length !== 1 ? "s" : ""})
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro cliente */}
              <div className="relative">
                <select
                  value={filtroCliente}
                  onChange={e => { setFiltroCliente(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white"
                >
                  <option value="todos">Todos los clientes</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Filtro mes */}
              <div className="relative">
                <select
                  value={filtroMes}
                  onChange={e => { setFiltroMes(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white"
                >
                  <option value="todos">Todos los meses</option>
                  {mesesUnicos.map(m => <option key={m} value={m}>{formatMesKey(m)}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Filtro moneda */}
              <div className="relative">
                <select
                  value={filtroMoneda}
                  onChange={e => { setFiltroMoneda(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white"
                >
                  <option value="todas">Toda moneda</option>
                  <option value="CLP">CLP</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              {/* Exportar */}
              <button
                onClick={exportarCSV}
                disabled={exportando || pagosFiltrados.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {exportando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {/* Desktop table */}
        {pagosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <CreditCard size={32} className="mx-auto mb-3 opacity-20" />
            No hay pagos con los filtros seleccionados
          </div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Cliente</th>
                    <th className="px-5 py-3 text-left">Período</th>
                    <th className="px-5 py-3 text-right">Monto</th>
                    <th className="px-5 py-3 text-center">Comp.</th>
                    <th className="px-5 py-3 text-left">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pagosPagina.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{formatFecha(p.fechaPago)}</td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-gray-800">{p.clienteNombre}</p>
                        <p className="text-xs text-gray-400">{p.clienteDominio}</p>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{formatPeriodo(p.periodoInicio, p.periodoFin)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-800">
                        {formatMonto(p.monto, p.moneda)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {p.comprobante ? (
                          <a
                            href={`/api/pagos/${p.id}/comprobante`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                            title="Ver comprobante"
                          >
                            <FileText size={13} />
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">{p.registradoPor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-50">
              {pagosPagina.map(p => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-gray-800 text-sm">{p.clienteNombre}</p>
                    <p className="font-bold text-gray-900 text-sm shrink-0">{formatMonto(p.monto, p.moneda)}</p>
                  </div>
                  <p className="text-xs text-gray-500">{formatPeriodo(p.periodoInicio, p.periodoFin)}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">{formatFecha(p.fechaPago)} · {p.registradoPor}</p>
                    {p.comprobante && (
                      <a
                        href={`/api/pagos/${p.id}/comprobante`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 flex items-center gap-1"
                      >
                        <FileText size={11} /> Comprobante
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Página {pagina} de {totalPaginas} · {pagosFiltrados.length} pagos
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={pagina === 1}
                    onClick={() => setPagina(p => p - 1)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    ← Anterior
                  </button>
                  <button
                    disabled={pagina === totalPaginas}
                    onClick={() => setPagina(p => p + 1)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <ModalRegistrarPago
          clientes={clientes}
          clientePreseleccionado={clientePre}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}
