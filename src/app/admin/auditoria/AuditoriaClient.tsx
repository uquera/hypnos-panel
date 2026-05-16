"use client"

import { useState, useMemo } from "react"
import { ShieldCheck, TrendingUp, TrendingDown, Wallet, Users, RefreshCw, Search } from "lucide-react"

// ─── Configuración de acciones ────────────────────────────────────────────────

type Categoria = "financiero" | "licencias" | "clientes" | "otro"

interface AccionMeta {
  label:      string
  categoria:  Categoria
  color:      string         // tailwind bg class para badge
  textColor:  string         // tailwind text class
  icon:       React.ReactNode
  verbo:      string         // texto narrativo: "registró ingreso de"
}

const ACCIONES: Record<string, AccionMeta> = {
  PAGO_REGISTRADO:   { label: "Ingreso registrado", categoria: "financiero", color: "bg-emerald-100", textColor: "text-emerald-700", icon: <TrendingUp size={11} />,   verbo: "registró ingreso de" },
  INGRESO_EDITADO:   { label: "Ingreso editado",    categoria: "financiero", color: "bg-blue-100",    textColor: "text-blue-700",    icon: <TrendingUp size={11} />,   verbo: "editó ingreso de" },
  INGRESO_ELIMINADO: { label: "Ingreso eliminado",  categoria: "financiero", color: "bg-red-100",     textColor: "text-red-700",     icon: <TrendingUp size={11} />,   verbo: "eliminó ingreso de" },
  GASTO_REGISTRADO:  { label: "Gasto registrado",   categoria: "financiero", color: "bg-orange-100",  textColor: "text-orange-700",  icon: <TrendingDown size={11} />, verbo: "registró gasto" },
  GASTO_EDITADO:     { label: "Gasto editado",      categoria: "financiero", color: "bg-blue-100",    textColor: "text-blue-700",    icon: <TrendingDown size={11} />, verbo: "editó gasto" },
  GASTO_ELIMINADO:   { label: "Gasto eliminado",    categoria: "financiero", color: "bg-red-100",     textColor: "text-red-700",     icon: <TrendingDown size={11} />, verbo: "eliminó gasto" },
  RETIRO_REGISTRADO: { label: "Retiro registrado",  categoria: "financiero", color: "bg-amber-100",   textColor: "text-amber-700",   icon: <Wallet size={11} />,       verbo: "registró retiro" },
  RETIRO_EDITADO:    { label: "Retiro editado",      categoria: "financiero", color: "bg-blue-100",    textColor: "text-blue-700",    icon: <Wallet size={11} />,       verbo: "editó retiro" },
  RETIRO_ELIMINADO:  { label: "Retiro eliminado",    categoria: "financiero", color: "bg-red-100",     textColor: "text-red-700",     icon: <Wallet size={11} />,       verbo: "eliminó retiro" },
  LICENCIA_SYNC:     { label: "Licencia sincronizada", categoria: "licencias", color: "bg-indigo-100", textColor: "text-indigo-700",  icon: <RefreshCw size={11} />,    verbo: "sincronizó licencia de" },
  RENOVACION:        { label: "Renovación",           categoria: "licencias", color: "bg-violet-100",  textColor: "text-violet-700",  icon: <RefreshCw size={11} />,    verbo: "renovó licencia de" },
  CLIENTE_CREADO:    { label: "Cliente creado",        categoria: "clientes",  color: "bg-teal-100",   textColor: "text-teal-700",    icon: <Users size={11} />,        verbo: "creó cliente" },
  CLIENTE_ARCHIVADO: { label: "Cliente archivado",     categoria: "clientes",  color: "bg-gray-200",   textColor: "text-gray-600",    icon: <Users size={11} />,        verbo: "archivó cliente" },
}

const FALLBACK_META: AccionMeta = {
  label: "Acción", categoria: "otro", color: "bg-gray-100", textColor: "text-gray-500",
  icon: <ShieldCheck size={11} />, verbo: "realizó acción",
}

// ─── Categorías de filtro ─────────────────────────────────────────────────────

const TABS = [
  { key: "todos",       label: "Todo" },
  { key: "financiero",  label: "Financiero" },
  { key: "licencias",   label: "Licencias" },
  { key: "clientes",    label: "Clientes" },
] as const

type Tab = typeof TABS[number]["key"]

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface LogItem {
  id:            string
  usuarioNombre: string
  clienteNombre: string | null
  accion:        string
  detalle:       string | null
  createdAt:     string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60)  return "ahora"
  const m = Math.floor(s / 60)
  if (m < 60)  return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `hace ${h}h`
  const days = Math.floor(h / 24)
  if (days === 1) return "hace 1 día"
  if (days < 7)   return `hace ${days} días`
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
}

function fmtFechaCompleta(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AuditoriaClient({ logs }: { logs: LogItem[] }) {
  const [tab,      setTab]      = useState<Tab>("financiero")
  const [accion,   setAccion]   = useState("todas")
  const [busqueda, setBusqueda] = useState("")
  const [verTodos, setVerTodos] = useState(false)

  // Acciones disponibles según el tab activo
  const accionesDisponibles = useMemo(() => {
    const set = new Set(logs.map(l => l.accion))
    return Array.from(set).filter(a => {
      if (tab === "todos") return true
      return (ACCIONES[a]?.categoria ?? "otro") === tab
    })
  }, [logs, tab])

  // Filtrado
  const filtrados = useMemo(() => {
    return logs.filter(l => {
      const meta = ACCIONES[l.accion] ?? FALLBACK_META
      if (tab !== "todos" && meta.categoria !== tab) return false
      if (accion !== "todas" && l.accion !== accion) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const hay = [l.usuarioNombre, l.clienteNombre, l.detalle, l.accion]
          .filter(Boolean).join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [logs, tab, accion, busqueda])

  const visibles = verTodos ? filtrados : filtrados.slice(0, 20)

  // Contadores rápidos (solo financiero)
  const finLogs = logs.filter(l => (ACCIONES[l.accion]?.categoria ?? "otro") === "financiero")
  const countEliminaciones = finLogs.filter(l => l.accion.endsWith("_ELIMINADO")).length
  const countEdiciones     = finLogs.filter(l => l.accion.endsWith("_EDITADO")).length
  const countRegistros     = finLogs.filter(l => l.accion.endsWith("_REGISTRADO")).length

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={22} className="text-indigo-600" />
          Auditoría
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Registro completo de quién hizo qué y cuándo</p>
      </div>

      {/* KPIs rápidos (financiero) */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Registros financieros", value: countRegistros,    color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Ediciones",             value: countEdiciones,    color: "text-blue-600",    bg: "bg-blue-50" },
          { label: "Eliminaciones",         value: countEliminaciones, color: "text-red-600",    bg: "bg-red-50" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl px-4 py-3 border border-white`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-4 pt-3 gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setAccion("todas") }}
              className={[
                "px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors",
                tab === t.key
                  ? "border-indigo-500 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {t.label}
              {t.key !== "todos" && (
                <span className="ml-1.5 text-xs text-gray-400">
                  ({logs.filter(l => (ACCIONES[l.accion]?.categoria ?? "otro") === t.key).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Fila de filtros */}
        <div className="px-4 py-3 flex flex-wrap gap-3">
          {/* Buscador */}
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 flex-1 min-w-[180px]">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por usuario, cliente, detalle…"
              className="text-sm outline-none flex-1 placeholder:text-gray-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>

          {/* Filtro por acción */}
          <select
            value={accion}
            onChange={e => setAccion(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="todas">Todas las acciones</option>
            {accionesDisponibles.map(a => (
              <option key={a} value={a}>{ACCIONES[a]?.label ?? a}</option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        {filtrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            No hay registros con los filtros aplicados
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/70 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-5 py-3 text-left w-36">Fecha</th>
                    <th className="px-4 py-3 text-left w-32">Usuario</th>
                    <th className="px-4 py-3 text-left w-44">Acción</th>
                    <th className="px-4 py-3 text-left">Detalle</th>
                    <th className="px-4 py-3 text-left w-36">Cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibles.map(l => {
                    const meta = ACCIONES[l.accion] ?? FALLBACK_META
                    return (
                      <tr key={l.id} className="hover:bg-gray-50/50 transition-colors group">
                        {/* Fecha */}
                        <td className="px-5 py-3">
                          <span className="text-gray-700 font-medium text-xs">{timeAgo(l.createdAt)}</span>
                          <p className="text-gray-400 text-xs leading-tight mt-0.5 hidden group-hover:block">
                            {fmtFechaCompleta(l.createdAt)}
                          </p>
                        </td>

                        {/* Usuario */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                              {l.usuarioNombre.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-gray-800 font-medium truncate max-w-[80px]">
                              {l.usuarioNombre.split(" ")[0]}
                            </span>
                          </div>
                        </td>

                        {/* Acción — badge */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color} ${meta.textColor}`}>
                            {meta.icon}
                            {meta.label}
                          </span>
                        </td>

                        {/* Detalle */}
                        <td className="px-4 py-3 text-gray-600 max-w-xs">
                          <span className="line-clamp-2 text-xs leading-relaxed">
                            {l.detalle ?? "—"}
                          </span>
                        </td>

                        {/* Cliente */}
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {l.clienteNombre ?? <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pie de tabla */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Mostrando {visibles.length} de {filtrados.length} registros
              </p>
              {filtrados.length > 20 && !verTodos && (
                <button
                  onClick={() => setVerTodos(true)}
                  className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                >
                  Ver todos ({filtrados.length})
                </button>
              )}
              {verTodos && filtrados.length > 20 && (
                <button
                  onClick={() => setVerTodos(false)}
                  className="text-xs text-gray-500 font-medium hover:text-gray-700 transition-colors"
                >
                  Mostrar solo 20
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
