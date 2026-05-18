"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  TrendingDown,
  TrendingUp,
  Wallet,
  Target,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MetricasIntegrante {
  cobrado:    number
  gastado:    number
  retirado:   number
  disponible: number
}

interface RetiroRow {
  id:       string
  monto:    number
  moneda:   string
  fecha:    string
  concepto: string | null
}

interface Integrante {
  id:           string
  nombre:       string
  email:        string
  role:         string
  mesActual:    MetricasIntegrante
  mesAnterior:  MetricasIntegrante
  historico:    MetricasIntegrante
  retiros:      RetiroRow[]
}

interface Props {
  integrantes:        Integrante[]
  totalEquipo:        MetricasIntegrante
  metaMensualUSD:     number
  usuarioActualId:    string
  usuarioActualRole:  string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PERIODOS = [
  { key: "mes",       label: "Este mes"       },
  { key: "anterior",  label: "Mes anterior"   },
  { key: "historico", label: "Todo el tiempo" },
] as const

type Periodo = typeof PERIODOS[number]["key"]

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function IntegrantesClient({
  integrantes,
  totalEquipo,
  metaMensualUSD,
  usuarioActualId,
  usuarioActualRole,
}: Props) {
  const router     = useRouter()
  const [periodo,  setPeriodo]  = useState<Periodo>("mes")
  const [isPending, startTransition] = useTransition()

  // Modal registrar
  const [modalAbierto,    setModalAbierto]    = useState(false)
  const [editando,        setEditando]        = useState<RetiroRow | null>(null)
  const [editandoUserId,  setEditandoUserId]  = useState<string>("")
  const [guardando,       setGuardando]       = useState(false)
  const [error,           setError]           = useState("")

  // Paginación retiros
  const PAGE_SIZE = 10
  const [pagina, setPagina] = useState(1)

  const isAdmin = usuarioActualRole === "ADMIN"

  // Todos los retiros ordenados (para tabla global)
  const todosRetiros: (RetiroRow & { userName: string; userId: string })[] = integrantes
    .flatMap(i => i.retiros.map(r => ({ ...r, userName: i.nombre, userId: i.id })))
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

  const retirosFiltrados = isAdmin
    ? todosRetiros
    : todosRetiros.filter(r => r.userId === usuarioActualId)

  const totalPaginas = Math.max(1, Math.ceil(retirosFiltrados.length / PAGE_SIZE))
  const retirosPagina = retirosFiltrados.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE)

  function getMetricas(i: Integrante): MetricasIntegrante {
    if (periodo === "anterior")  return i.mesAnterior
    if (periodo === "historico") return i.historico
    return i.mesActual
  }

  function getTotalEquipoSegunPeriodo(): MetricasIntegrante {
    if (periodo === "anterior") {
      return {
        cobrado:    integrantes.reduce((s, i) => s + i.mesAnterior.cobrado, 0),
        gastado:    integrantes.reduce((s, i) => s + i.mesAnterior.gastado, 0),
        retirado:   integrantes.reduce((s, i) => s + i.mesAnterior.retirado, 0),
        disponible: integrantes.reduce((s, i) => s + i.mesAnterior.disponible, 0),
      }
    }
    if (periodo === "historico") {
      return {
        cobrado:    integrantes.reduce((s, i) => s + i.historico.cobrado, 0),
        gastado:    integrantes.reduce((s, i) => s + i.historico.gastado, 0),
        retirado:   integrantes.reduce((s, i) => s + i.historico.retirado, 0),
        disponible: integrantes.reduce((s, i) => s + i.historico.disponible, 0),
      }
    }
    return totalEquipo
  }

  const equipoActual = getTotalEquipoSegunPeriodo()

  // ─── Acciones ───────────────────────────────────────────────────────────────

  async function handleGuardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setGuardando(true)
    setError("")
    const fd  = new FormData(e.currentTarget)
    const body = {
      monto:     fd.get("monto"),
      moneda:    fd.get("moneda"),
      fecha:     fd.get("fecha"),
      concepto:  fd.get("concepto"),
      usuarioId: fd.get("usuarioId"),
    }
    try {
      const url = editando ? `/api/retiros/${editando.id}` : "/api/retiros"
      const res = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || "Error al guardar"); return }
      setModalAbierto(false)
      setEditando(null)
      startTransition(() => router.refresh())
    } catch {
      setError("Error de conexión")
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este retiro?")) return
    const res = await fetch(`/api/retiros/${id}`, { method: "DELETE" })
    if (res.ok) startTransition(() => router.refresh())
  }

  function abrirEdicion(r: RetiroRow & { userId: string }) {
    setEditando(r)
    setEditandoUserId(r.userId)
    setModalAbierto(true)
    setError("")
  }

  function abrirNuevo() {
    setEditando(null)
    setEditandoUserId(isAdmin ? integrantes[0]?.id ?? "" : usuarioActualId)
    setModalAbierto(true)
    setError("")
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-indigo-600" />
            Integrantes
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Balance individual y retiros del equipo</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro período */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white text-sm">
            {PERIODOS.map(p => (
              <button
                key={p.key}
                onClick={() => { setPeriodo(p.key); setPagina(1) }}
                className={[
                  "px-3 py-1.5 font-medium transition-colors",
                  periodo === p.key
                    ? "bg-indigo-600 text-white"
                    : "text-gray-600 hover:bg-gray-50",
                ].join(" ")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={abrirNuevo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
          >
            <Plus size={15} />
            Registrar retiro
          </button>
        </div>
      </div>

      {/* Resumen equipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Cobrado equipo", value: equipoActual.cobrado,    icon: TrendingUp,   color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Gastado equipo", value: equipoActual.gastado,    icon: TrendingDown, color: "text-rose-400",    bg: "bg-rose-50" },
          { label: "Retirado",       value: equipoActual.retirado,   icon: Wallet,       color: "text-amber-400",   bg: "bg-amber-50" },
          { label: "Disponible",     value: equipoActual.disponible, icon: Target,       color: equipoActual.disponible >= 0 ? "text-indigo-600" : "text-rose-400", bg: equipoActual.disponible >= 0 ? "bg-indigo-50" : "bg-rose-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={16} className={color} />
            </div>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${color}`}>
              ${fmt(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Cards por integrante */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrantes.map(integrante => {
          const m         = getMetricas(integrante)
          const pctMeta   = Math.min(100, Math.max(0, (m.disponible / metaMensualUSD) * 100))
          const metaOk    = m.disponible >= metaMensualUSD
          const metaCerca = m.disponible >= metaMensualUSD * 0.5 && !metaOk
          const metaColor = metaOk ? "text-emerald-600" : metaCerca ? "text-amber-500" : "text-rose-400"
          const metaBarBg = metaOk ? "bg-emerald-500" : metaCerca ? "bg-amber-500" : "bg-rose-400"
          const totalBar  = m.cobrado > 0 ? m.cobrado : 1

          return (
            <div key={integrante.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
              {/* Cabecera */}
              <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                     style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
                  {integrante.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 leading-none">{integrante.nombre}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{integrante.email}</p>
                </div>
                <span className={[
                  "text-xs font-medium px-2 py-0.5 rounded-full",
                  integrante.role === "ADMIN"
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-600",
                ].join(" ")}>
                  {integrante.role === "ADMIN" ? "Admin" : "Cobrador"}
                </span>
              </div>

              {/* Métricas */}
              <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs text-gray-400">Cobrado</p>
                  <p className="text-base font-bold text-emerald-600">${fmt(m.cobrado)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Gastado</p>
                  <p className="text-base font-bold text-rose-400">${fmt(m.gastado)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Retirado</p>
                  <p className="text-base font-bold text-amber-400">${fmt(m.retirado)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Disponible</p>
                  <p className={`text-base font-bold ${m.disponible >= 0 ? "text-indigo-600" : "text-rose-400"}`}>
                    ${fmt(m.disponible)}
                  </p>
                </div>
              </div>

              {/* Barra de distribución */}
              {m.cobrado > 0 && (
                <div className="px-5 pb-2">
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
                    <div className="bg-emerald-400 h-full" style={{ width: `${(m.gastado / totalBar) * 100}%` }} />
                    <div className="bg-amber-400 h-full" style={{ width: `${(m.retirado / totalBar) * 100}%` }} />
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400 inline-block" />Gastado</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" />Retirado</span>
                  </div>
                </div>
              )}

              {/* Meta mensual $200 — solo mostrar en periodo "mes" */}
              {periodo === "mes" && (
                <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <Target size={13} />
                      Meta mensual: ${fmt(metaMensualUSD)}
                    </div>
                    <span className={`text-xs font-bold ${metaColor}`}>
                      {metaOk ? `✓ Cumplida` : `${fmt(pctMeta)}%`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${metaBarBg}`}
                      style={{ width: `${pctMeta}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${metaColor}`}>
                    {metaOk
                      ? `+$${fmt(m.disponible - metaMensualUSD)} sobre la meta`
                      : `Faltan $${fmt(Math.max(0, metaMensualUSD - m.disponible))} para la meta`
                    }
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tabla de retiros */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">Historial de retiros</h2>
          <span className="text-xs text-gray-400">{retirosFiltrados.length} registros</span>
        </div>

        {retirosFiltrados.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No hay retiros registrados aún
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Fecha</th>
                    {isAdmin && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Integrante</th>}
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Concepto</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Monto</th>
                    {isAdmin && <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {retirosPagina.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50/40 transition-colors">
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-800">{r.userName}</span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                        {r.concepto || <span className="italic text-gray-300">Sin concepto</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-400 whitespace-nowrap">
                        {r.moneda} {fmt(r.monto)}
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirEdicion(r)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleEliminar(r.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-400 text-xs">
                  Página {pagina} de {totalPaginas}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                    disabled={pagina === 1}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                    disabled={pagina === totalPaginas}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal registrar / editar retiro */}
      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalAbierto(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
            <h2 className="text-base font-bold text-gray-900 mb-4">
              {editando ? "Editar retiro" : "Registrar retiro"}
            </h2>
            <form onSubmit={handleGuardar} className="space-y-4">

              {/* Usuario — solo ADMIN puede elegir */}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Integrante</label>
                  <select
                    name="usuarioId"
                    defaultValue={editando ? editandoUserId : (isAdmin ? integrantes[0]?.id : usuarioActualId)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    disabled={!!editando}
                  >
                    {integrantes.map(i => (
                      <option key={i.id} value={i.id}>{i.nombre}</option>
                    ))}
                  </select>
                </div>
              )}
              {!isAdmin && (
                <input type="hidden" name="usuarioId" value={usuarioActualId} />
              )}

              {/* Monto + Moneda */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Monto *</label>
                  <input
                    type="number"
                    name="monto"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={editando?.monto}
                    placeholder="0.00"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Moneda</label>
                  <select
                    name="moneda"
                    defaultValue={editando?.moneda ?? "USD"}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="USD">USD</option>
                    <option value="CLP">CLP</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Fecha</label>
                <input
                  type="date"
                  name="fecha"
                  defaultValue={editando ? editando.fecha.split("T")[0] : new Date().toISOString().split("T")[0]}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Concepto</label>
                <input
                  type="text"
                  name="concepto"
                  defaultValue={editando?.concepto ?? ""}
                  placeholder="Sueldo quincenal, gastos personales…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setModalAbierto(false); setEditando(null) }}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}
                >
                  {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Registrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPending && (
        <div className="fixed bottom-4 right-4 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg">
          Actualizando…
        </div>
      )}
    </div>
  )
}
