"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CreditCard, TrendingUp, TrendingDown, Minus, Users, AlertTriangle,
  Plus, X, FileText, Download, ChevronDown, Loader2, Pencil, Trash2,
  Sparkles, Code2, Receipt, Search,
} from "lucide-react"
import { toast } from "sonner"

// ─── Verticales ───────────────────────────────────────────────────────────────

type Concepto = "LICENCIA" | "MARKETING" | "DESARROLLO"

const CONCEPTO_META: Record<Concepto, {
  label: string
  badgeClass: string
  dotClass: string
  icon: React.ReactNode
  placeholder: string
}> = {
  LICENCIA:   {
    label: "Mensualidad",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-500",
    icon: <Receipt size={11} />,
    placeholder: "",
  },
  MARKETING: {
    label: "Marketing",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    dotClass: "bg-purple-500",
    icon: <Sparkles size={11} />,
    placeholder: "Ej: Contenido IA — mayo, Branding marca, Pack redes sociales…",
  },
  DESARROLLO: {
    label: "Desarrollo",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
    dotClass: "bg-teal-500",
    icon: <Code2 size={11} />,
    placeholder: "Ej: Landing page, Feature nueva, Mantenimiento mensual…",
  },
}

function ConceptoBadge({ concepto }: { concepto: string }) {
  const meta = CONCEPTO_META[concepto as Concepto] ?? CONCEPTO_META.LICENCIA
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.badgeClass}`}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PagoItem {
  id: string
  clienteId: string
  clienteNombre: string
  clienteDominio: string
  concepto: string
  conceptoDetalle: string | null
  monto: number
  moneda: string
  periodoInicio: string | null
  periodoFin: string | null
  fechaPago: string
  comprobante: string | null
  notas: string | null
  registradoPor: string
}

interface ClienteBasic { id: string; nombre: string }

interface ChartMonth {
  label: string; key: string
  licencia: number; marketing: number; desarrollo: number; total: number
}

interface KPIs {
  totalEsteMes: number
  totalMesAnterior: number
  variacionPct: number | null
  totalHistorico: number
  clientesActivos: number
  clientesPorVencer: number
  verticalesEsteMes: { licencia: number; marketing: number; desarrollo: number }
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

function formatPeriodo(inicio: string | null, fin: string | null) {
  if (!inicio || !fin) return null
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
  return { inicio: inicio.toISOString().split("T")[0], fin: fin.toISOString().split("T")[0] }
}

function todayISO() { return new Date().toISOString().split("T")[0] }

// ─── Bar Chart apilado ────────────────────────────────────────────────────────

function StackedBarChart({ months, mesActualKey }: { months: ChartMonth[]; mesActualKey: string }) {
  const [tooltip, setTooltip] = useState<number | null>(null)
  const max = Math.max(...months.map(m => m.total), 1)

  return (
    <div className="relative">
      {/* Leyenda */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        {(["LICENCIA", "MARKETING", "DESARROLLO"] as Concepto[]).map(c => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${CONCEPTO_META[c].dotClass}`} />
            {CONCEPTO_META[c].label}
          </span>
        ))}
      </div>

      <div className="flex items-end gap-1.5 h-40">
        {months.map((m, i) => {
          const pct = (v: number) => max > 0 ? (v / max) * 100 : 0
          const isActual = m.key === mesActualKey
          const opacity = isActual ? "1" : "0.65"
          return (
            <div
              key={m.key}
              className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
              onMouseEnter={() => setTooltip(i)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className="w-full flex flex-col justify-end rounded-t-sm overflow-hidden" style={{ height: "128px", opacity }}>
                {m.desarrollo > 0 && (
                  <div style={{ height: `${pct(m.desarrollo)}%`, background: "#0d9488", minHeight: "3px" }} />
                )}
                {m.marketing > 0 && (
                  <div style={{ height: `${pct(m.marketing)}%`, background: "#9333ea", minHeight: "3px" }} />
                )}
                {m.licencia > 0 && (
                  <div style={{ height: `${pct(m.licencia)}%`, background: "#4f46e5", minHeight: "3px" }} />
                )}
                {m.total === 0 && <div style={{ height: "0px" }} />}
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
          className="absolute -top-2 pointer-events-none z-10 bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg whitespace-nowrap"
          style={{ left: `${(tooltip / months.length) * 100}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold mb-1">{months[tooltip].label}</p>
          {months[tooltip].total === 0 ? (
            <p className="text-gray-400">Sin pagos</p>
          ) : (
            <>
              {months[tooltip].licencia   > 0 && <p className="text-indigo-300">Mensualidad: {formatUSD(months[tooltip].licencia)}</p>}
              {months[tooltip].marketing  > 0 && <p className="text-purple-300">Marketing: {formatUSD(months[tooltip].marketing)}</p>}
              {months[tooltip].desarrollo > 0 && <p className="text-teal-300">Desarrollo: {formatUSD(months[tooltip].desarrollo)}</p>}
              <p className="border-t border-gray-700 mt-1 pt-1 font-semibold">Total: {formatUSD(months[tooltip].total)}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Campos específicos por vertical ──────────────────────────────────────────

function CamposConcepto({
  concepto,
  conceptoDetalle,
  periodoInicio,
  periodoFin,
  onChange,
  onSetMes,
}: {
  concepto: Concepto
  conceptoDetalle: string
  periodoInicio: string
  periodoFin: string
  onChange: (key: string, val: string) => void
  onSetMes: (offset: number) => void
}) {
  if (concepto === "LICENCIA") {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Período *</label>
        <div className="flex gap-1.5 mb-2">
          {[["Este mes", 0], ["Mes anterior", -1]].map(([label, offset]) => (
            <button key={String(label)} type="button" onClick={() => onSetMes(Number(offset))}
              className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={periodoInicio} onChange={e => onChange("periodoInicio", e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <input type="date" value={periodoFin} onChange={e => onChange("periodoFin", e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
      </div>
    )
  }

  const meta = CONCEPTO_META[concepto]
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Descripción del servicio *
      </label>
      <input
        type="text"
        value={conceptoDetalle}
        onChange={e => onChange("conceptoDetalle", e.target.value)}
        placeholder={meta.placeholder}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  )
}

// ─── Modal Registrar Pago ─────────────────────────────────────────────────────

function ModalRegistrarPago({
  clientes, clientePreseleccionado, onClose, onSuccess,
}: {
  clientes: ClienteBasic[]
  clientePreseleccionado?: string
  onClose: () => void
  onSuccess: () => void
}) {
  const mes = getMesCompleto(0)
  const [form, setForm] = useState({
    clienteId:       clientePreseleccionado ?? (clientes[0]?.id ?? ""),
    concepto:        "LICENCIA" as Concepto,
    conceptoDetalle: "",
    monto:           "",
    moneda:          "USD",
    periodoInicio:   mes.inicio,
    periodoFin:      mes.fin,
    fechaPago:       todayISO(),
    notas:           "",
  })
  const [file, setFile]            = useState<File | null>(null)
  const [submitting, setSub]       = useState(false)
  const [busqCliente, setBusq]     = useState("")
  const [dropOpen, setDropOpen]    = useState(false)
  const fileRef                    = useRef<HTMLInputElement>(null)
  const dropRef                    = useRef<HTMLDivElement>(null)

  const clienteSeleccionado = clientes.find(c => c.id === form.clienteId)
  const clientesFiltrados   = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqCliente.toLowerCase())
  )

  useEffect(() => {
    if (!dropOpen) return
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [dropOpen])

  function setField(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }
  function setMes(offset: number) { const m = getMesCompleto(offset); setForm(f => ({ ...f, periodoInicio: m.inicio, periodoFin: m.fin })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clienteId || !form.monto || Number(form.monto) <= 0) {
      toast.error("Completa todos los campos obligatorios"); return
    }
    setSub(true)
    try {
      const fd = new FormData()
      fd.append("monto",           form.monto)
      fd.append("moneda",          form.moneda)
      fd.append("concepto",        form.concepto)
      fd.append("conceptoDetalle", form.conceptoDetalle)
      fd.append("periodoInicio",   form.periodoInicio)
      fd.append("periodoFin",      form.periodoFin)
      fd.append("fechaPago",       form.fechaPago)
      fd.append("notas",           form.notas)
      if (file) fd.append("comprobante", file)

      const res = await fetch(`/api/clientes/${form.clienteId}/pagos`, { method: "POST", body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const { syncedRemote } = await res.json()
      toast.success(syncedRemote ? "Pago registrado y sincronizado" : "Pago registrado")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el pago")
    } finally {
      setSub(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Registrar pago</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Cliente — combobox buscable */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cliente *</label>
            <div className="relative" ref={dropRef}>
              <button
                type="button"
                onClick={() => { setDropOpen(v => !v); setBusq("") }}
                className="w-full flex items-center justify-between border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors text-left"
              >
                <span className={clienteSeleccionado ? "text-gray-800" : "text-gray-400"}>
                  {clienteSeleccionado?.nombre ?? "Seleccionar cliente…"}
                </span>
                <ChevronDown size={14} className="text-gray-400 shrink-0" />
              </button>

              {dropOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                    <Search size={13} className="text-gray-400 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={busqCliente}
                      onChange={e => setBusq(e.target.value)}
                      placeholder="Buscar cliente…"
                      className="flex-1 text-sm outline-none placeholder:text-gray-400"
                    />
                    {busqCliente && (
                      <button type="button" onClick={() => setBusq("")} className="text-gray-400 hover:text-gray-600">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  <ul className="max-h-48 overflow-y-auto py-1">
                    {clientesFiltrados.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-gray-400 text-center">Sin resultados</li>
                    ) : clientesFiltrados.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setField("clienteId", c.id); setDropOpen(false); setBusq("") }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${
                            form.clienteId === c.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700"
                          }`}
                        >
                          {c.nombre}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Vertical */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Vertical *</label>
            <div className="grid grid-cols-3 gap-2">
              {(["LICENCIA", "MARKETING", "DESARROLLO"] as Concepto[]).map(c => {
                const meta = CONCEPTO_META[c]
                const sel  = form.concepto === c
                return (
                  <button
                    key={c} type="button"
                    onClick={() => setForm(f => ({ ...f, concepto: c, conceptoDetalle: "" }))}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
                      sel ? `${meta.badgeClass} border-current` : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {meta.icon}
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Monto + moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Monto *</label>
              <input type="number" min="0" step="1" value={form.monto} onChange={e => setField("monto", e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Moneda</label>
              <div className="relative">
                <select value={form.moneda} onChange={e => setField("moneda", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8 bg-white">
                  <option value="USD">USD</option>
                  <option value="CLP">CLP</option>
                  <option value="EUR">EUR</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Campos dinámicos por vertical */}
          <CamposConcepto
            concepto={form.concepto}
            conceptoDetalle={form.conceptoDetalle}
            periodoInicio={form.periodoInicio}
            periodoFin={form.periodoFin}
            onChange={setField}
            onSetMes={setMes}
          />

          {/* Fecha de pago */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha de pago</label>
            <input type="date" value={form.fechaPago} onChange={e => setField("fechaPago", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Comprobante */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Comprobante (opcional)</label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {file
                ? <p className="text-sm text-indigo-600 font-medium">{file.name}</p>
                : <p className="text-xs text-gray-400">PDF, JPG, PNG o WebP · máx 10 MB</p>}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notas (opcional)</label>
            <textarea rows={2} value={form.notas} onChange={e => setField("notas", e.target.value)}
              placeholder="Observaciones internas…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : "Registrar pago"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal Editar Pago ────────────────────────────────────────────────────────

function ModalEditarPago({ pago, onClose, onSuccess }: { pago: PagoItem; onClose: () => void; onSuccess: () => void }) {
  const mes = getMesCompleto(0)
  const [form, setForm] = useState({
    concepto:        pago.concepto as Concepto,
    conceptoDetalle: pago.conceptoDetalle ?? "",
    monto:           String(pago.monto),
    moneda:          pago.moneda,
    periodoInicio:   pago.periodoInicio ? pago.periodoInicio.split("T")[0] : mes.inicio,
    periodoFin:      pago.periodoFin    ? pago.periodoFin.split("T")[0]    : mes.fin,
    fechaPago:       pago.fechaPago.split("T")[0],
    notas:           pago.notas ?? "",
  })
  const [file, setFile]      = useState<File | null>(null)
  const [submitting, setSub] = useState(false)
  const fileRef              = useRef<HTMLInputElement>(null)

  function setField(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }
  function setMes(offset: number) { const m = getMesCompleto(offset); setForm(f => ({ ...f, periodoInicio: m.inicio, periodoFin: m.fin })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.monto || Number(form.monto) <= 0) { toast.error("El monto debe ser mayor a 0"); return }
    setSub(true)
    try {
      const fd = new FormData()
      fd.append("concepto",        form.concepto)
      fd.append("conceptoDetalle", form.conceptoDetalle)
      fd.append("monto",           form.monto)
      fd.append("moneda",          form.moneda)
      fd.append("periodoInicio",   form.periodoInicio)
      fd.append("periodoFin",      form.periodoFin)
      fd.append("fechaPago",       form.fechaPago)
      fd.append("notas",           form.notas)
      if (file) fd.append("comprobante", file)

      const res = await fetch(`/api/pagos/${pago.id}`, { method: "PATCH", body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      toast.success("Pago actualizado")
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el pago")
    } finally {
      setSub(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Editar pago</h2>
            <p className="text-xs text-gray-400 mt-0.5">{pago.clienteNombre}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Vertical */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Vertical</label>
            <div className="grid grid-cols-3 gap-2">
              {(["LICENCIA", "MARKETING", "DESARROLLO"] as Concepto[]).map(c => {
                const meta = CONCEPTO_META[c]
                const sel  = form.concepto === c
                return (
                  <button key={c} type="button"
                    onClick={() => setForm(f => ({ ...f, concepto: c, conceptoDetalle: "" }))}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border-2 text-xs font-medium transition-all ${
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
              <input type="number" min="0" step="1" value={form.monto} onChange={e => setField("monto", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Moneda</label>
              <div className="relative">
                <select value={form.moneda} onChange={e => setField("moneda", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-8 bg-white">
                  <option value="USD">USD</option>
                  <option value="CLP">CLP</option>
                  <option value="EUR">EUR</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          <CamposConcepto
            concepto={form.concepto}
            conceptoDetalle={form.conceptoDetalle}
            periodoInicio={form.periodoInicio}
            periodoFin={form.periodoFin}
            onChange={setField}
            onSetMes={setMes}
          />

          {/* Fecha de pago */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Fecha de pago</label>
            <input type="date" value={form.fechaPago} onChange={e => setField("fechaPago", e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Comprobante */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Comprobante {pago.comprobante ? "(reemplazar)" : "(opcional)"}
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-400 transition-colors"
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {file
                ? <p className="text-sm text-indigo-600 font-medium">{file.name}</p>
                : pago.comprobante
                ? <p className="text-xs text-gray-400">Comprobante existente · click para reemplazar</p>
                : <p className="text-xs text-gray-400">PDF, JPG, PNG o WebP · máx 10 MB</p>}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Notas (opcional)</label>
            <textarea rows={2} value={form.notas} onChange={e => setField("notas", e.target.value)}
              placeholder="Observaciones internas…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : "Guardar cambios"}
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
  const [filtroCliente,  setFiltroCliente]  = useState("todos")
  const [filtroMes,      setFiltroMes]      = useState("todos")
  const [filtroMoneda,   setFiltroMoneda]   = useState("todas")
  const [filtroConcepto, setFiltroConcepto] = useState("todos")
  const [pagina,         setPagina]         = useState(1)
  const [modalOpen,      setModalOpen]      = useState(false)
  const [clientePre,     setClientePre]     = useState<string | undefined>()
  const [exportando,     setExportando]     = useState(false)
  const [editandoPago,   setEditandoPago]   = useState<PagoItem | null>(null)
  const [eliminandoId,   setEliminandoId]   = useState<string | null>(null)
  const PER_PAGE = 20

  const pagosFiltrados = pagos.filter(p => {
    if (filtroCliente  !== "todos"  && p.clienteId !== filtroCliente)  return false
    if (filtroMoneda   !== "todas"  && p.moneda    !== filtroMoneda)   return false
    if (filtroConcepto !== "todos"  && p.concepto  !== filtroConcepto) return false
    if (filtroMes !== "todos") {
      const fp  = new Date(p.fechaPago)
      const key = `${fp.getFullYear()}-${String(fp.getMonth() + 1).padStart(2, "0")}`
      if (key !== filtroMes) return false
    }
    return true
  })

  const totalPaginas = Math.ceil(pagosFiltrados.length / PER_PAGE)
  const pagosPagina  = pagosFiltrados.slice((pagina - 1) * PER_PAGE, pagina * PER_PAGE)

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

  function abrirModal(clienteId?: string) { setClientePre(clienteId); setModalOpen(true) }

  async function exportarCSV() {
    setExportando(true)
    try {
      const params = new URLSearchParams()
      if (filtroCliente !== "todos") params.set("clienteId", filtroCliente)
      if (filtroMes !== "todos") {
        const [year, month] = filtroMes.split("-")
        const inicio = new Date(Number(year), Number(month) - 1, 1)
        const fin    = new Date(Number(year), Number(month), 0)
        params.set("desde", inicio.toISOString().split("T")[0])
        params.set("hasta", fin.toISOString().split("T")[0])
      }
      const res  = await fetch(`/api/pagos/exportar?${params}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href = url
      a.download = `pagos-hypnos-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("CSV exportado correctamente")
    } catch { toast.error("Error al exportar") }
    finally { setExportando(false) }
  }

  async function eliminarPago(id: string) {
    if (!confirm("¿Eliminar este pago? Esta acción no se puede deshacer.")) return
    setEliminandoId(id)
    try {
      const res = await fetch(`/api/pagos/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Pago eliminado")
      router.refresh()
    } catch { toast.error("Error al eliminar el pago") }
    finally { setEliminandoId(null) }
  }

  const variacion      = kpis.variacionPct
  const VariacionIcon  = variacion === null ? Minus : variacion > 0 ? TrendingUp : TrendingDown
  const variacionColor = variacion === null ? "text-gray-400" : variacion > 0 ? "text-emerald-600" : "text-red-500"

  // Descripción a mostrar en la tabla para cada pago
  function descripcionPago(p: PagoItem): string {
    if (p.concepto === "LICENCIA") return formatPeriodo(p.periodoInicio, p.periodoFin) ?? "—"
    return p.conceptoDetalle || "—"
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pagos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ingresos por mensualidades, marketing y desarrollo</p>
        </div>
        <button onClick={() => abrirModal()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          <Plus size={15} /> Registrar pago
        </button>
      </div>

      {/* KPI Cards principales */}
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

      {/* Desglose por vertical — este mes */}
      <div className="grid grid-cols-3 gap-3">
        {([
          { key: "licencia",   label: "Mensualidad", icon: <Receipt size={14} />, color: "indigo", val: kpis.verticalesEsteMes.licencia },
          { key: "marketing",  label: "Marketing",   icon: <Sparkles size={14} />, color: "purple", val: kpis.verticalesEsteMes.marketing },
          { key: "desarrollo", label: "Desarrollo",  icon: <Code2 size={14} />, color: "teal",   val: kpis.verticalesEsteMes.desarrollo },
        ] as const).map(v => (
          <div key={v.key} className={`bg-white rounded-2xl border shadow-sm p-4 border-${v.color}-100`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-7 h-7 rounded-lg bg-${v.color}-50 flex items-center justify-center text-${v.color}-600`}>
                {v.icon}
              </div>
              <p className="text-xs font-medium text-gray-500">{v.label}</p>
            </div>
            <p className={`text-lg font-bold ${v.val > 0 ? `text-${v.color}-700` : "text-gray-400"}`}>
              {formatUSD(v.val)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">este mes</p>
          </div>
        ))}
      </div>

      {/* Gráfico apilado */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Ingresos por vertical — últimos 12 meses</h2>
        <StackedBarChart months={chartMonths} mesActualKey={mesActualKey} />
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
                <button onClick={() => abrirModal(c.id)}
                  className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-200 flex items-center gap-1">
                  <Plus size={11} /> Pago
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        {/* Header tabla + filtros */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800 flex-1">
              Todos los pagos
              <span className="ml-2 text-xs font-normal text-gray-400">
                ({pagosFiltrados.length} registro{pagosFiltrados.length !== 1 ? "s" : ""})
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro vertical */}
              <div className="relative">
                <select value={filtroConcepto} onChange={e => { setFiltroConcepto(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white">
                  <option value="todos">Todas las verticales</option>
                  <option value="LICENCIA">Mensualidad</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="DESARROLLO">Desarrollo</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {/* Filtro cliente */}
              <div className="relative">
                <select value={filtroCliente} onChange={e => { setFiltroCliente(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white">
                  <option value="todos">Todos los clientes</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {/* Filtro mes */}
              <div className="relative">
                <select value={filtroMes} onChange={e => { setFiltroMes(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white">
                  <option value="todos">Todos los meses</option>
                  {mesesUnicos.map(m => <option key={m} value={m}>{formatMesKey(m)}</option>)}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {/* Filtro moneda */}
              <div className="relative">
                <select value={filtroMoneda} onChange={e => { setFiltroMoneda(e.target.value); setPagina(1) }}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none pr-7 bg-white">
                  <option value="todas">Toda moneda</option>
                  <option value="USD">USD</option>
                  <option value="CLP">CLP</option>
                  <option value="EUR">EUR</option>
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              {/* Exportar */}
              <button onClick={exportarCSV} disabled={exportando || pagosFiltrados.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
                {exportando ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {pagosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            <CreditCard size={32} className="mx-auto mb-3 opacity-20" />
            No hay pagos con los filtros seleccionados
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-5 py-3 text-left">Fecha</th>
                    <th className="px-5 py-3 text-left">Cliente</th>
                    <th className="px-5 py-3 text-left">Vertical</th>
                    <th className="px-5 py-3 text-left">Descripción</th>
                    <th className="px-5 py-3 text-right">Monto</th>
                    <th className="px-5 py-3 text-center">Comp.</th>
                    <th className="px-5 py-3 text-left">Por</th>
                    {isAdmin && <th className="px-5 py-3 text-center">Acc.</th>}
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
                      <td className="px-5 py-3.5"><ConceptoBadge concepto={p.concepto} /></td>
                      <td className="px-5 py-3.5 text-gray-600 max-w-xs truncate">{descripcionPago(p)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-gray-800">{formatMonto(p.monto, p.moneda)}</td>
                      <td className="px-5 py-3.5 text-center">
                        {p.comprobante ? (
                          <a href={`/api/pagos/${p.id}/comprobante`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                            <FileText size={13} />
                          </a>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 text-xs">{p.registradoPor}</td>
                      {isAdmin && (
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setEditandoPago(p)}
                              className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-400 hover:text-indigo-600 transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => eliminarPago(p.id)} disabled={eliminandoId === p.id}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40">
                              {eliminandoId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </div>
                        </td>
                      )}
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
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{p.clienteNombre}</p>
                      <div className="mt-1"><ConceptoBadge concepto={p.concepto} /></div>
                    </div>
                    <p className="font-bold text-gray-900 text-sm shrink-0">{formatMonto(p.monto, p.moneda)}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{descripcionPago(p)}</p>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-gray-400">{formatFecha(p.fechaPago)} · {p.registradoPor}</p>
                    <div className="flex items-center gap-1">
                      {p.comprobante && (
                        <a href={`/api/pagos/${p.id}/comprobante`} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-indigo-600 flex items-center gap-1">
                          <FileText size={11} /> Comp.
                        </a>
                      )}
                      {isAdmin && (
                        <>
                          <button onClick={() => setEditandoPago(p)} className="p-1 rounded text-indigo-400 hover:text-indigo-600">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => eliminarPago(p.id)} disabled={eliminandoId === p.id}
                            className="p-1 rounded text-gray-300 hover:text-red-500 disabled:opacity-40">
                            {eliminandoId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Página {pagina} de {totalPaginas}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    Anterior
                  </button>
                  <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}
                    className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modales */}
      {modalOpen && (
        <ModalRegistrarPago
          clientes={clientes}
          clientePreseleccionado={clientePre}
          onClose={() => { setModalOpen(false); setClientePre(undefined) }}
          onSuccess={() => { setModalOpen(false); setClientePre(undefined); router.refresh() }}
        />
      )}
      {editandoPago && (
        <ModalEditarPago
          pago={editandoPago}
          onClose={() => setEditandoPago(null)}
          onSuccess={() => { setEditandoPago(null); router.refresh() }}
        />
      )}
    </div>
  )
}
