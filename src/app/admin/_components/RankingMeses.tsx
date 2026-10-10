"use client"

import { useState } from "react"
import { CalendarRange, TrendingUp, TrendingDown, Minus } from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface MesIngresos {
  key:        string   // "2026-10"
  label:      string   // "octubre 2026"
  corto:      string   // "oct 26"
  licencia:   number
  marketing:  number
  desarrollo: number
  total:      number
  clientes:   number   // clientes distintos que pagaron ese mes
  pagos:      number
}

type Orden = "monto" | "fecha"

// Mismos colores que el ranking de clientes y el módulo de Ingresos.
const VERTICALES = [
  { k: "licencia"   as const, label: "Mensualidad", bar: "bg-indigo-500", dot: "bg-indigo-500" },
  { k: "marketing"  as const, label: "Marketing",   bar: "bg-purple-500", dot: "bg-purple-500" },
  { k: "desarrollo" as const, label: "Desarrollo",  bar: "bg-teal-500",   dot: "bg-teal-500"   },
]

function usd(monto: number): string {
  return "$" + monto.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const MEDALLA: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 ring-1 ring-amber-300",
  2: "bg-gray-100 text-gray-600 ring-1 ring-gray-300",
  3: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RankingMeses({ meses }: { meses: MesIngresos[] }) {
  const [orden, setOrden] = useState<Orden>("monto")
  const [todo,  setTodo]  = useState(false)

  // `meses` llega en orden cronológico ascendente y con los huecos rellenos.
  const ventana = todo ? meses : meses.slice(-12)

  // La posición se calcula siempre por monto, así en la vista cronológica
  // igual se ve qué lugar ocupa cada mes.
  const posicion = new Map<string, number>()
  ;[...ventana].sort((a, b) => b.total - a.total).forEach((m, i) => posicion.set(m.key, i + 1))

  const visibles = orden === "monto"
    ? [...ventana].filter(m => m.total > 0).sort((a, b) => b.total - a.total)
    : [...ventana].reverse()

  const conIngresos = ventana.filter(m => m.total > 0)
  const total    = conIngresos.reduce((s, m) => s + m.total, 0)
  const maximo   = Math.max(0, ...ventana.map(m => m.total))
  const promedio = conIngresos.length > 0 ? total / conIngresos.length : 0
  const mejor    = conIngresos.length > 0 ? [...conIngresos].sort((a, b) => b.total - a.total)[0] : null

  // Variación contra el mes calendario anterior (aunque no esté en la ventana).
  const indice = new Map(meses.map((m, i) => [m.key, i]))
  const variacion = (m: MesIngresos): number | null => {
    const i = indice.get(m.key)
    if (i === undefined || i === 0) return null
    const prev = meses[i - 1]
    if (prev.total === 0) return null
    return ((m.total - prev.total) / prev.total) * 100
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Encabezado + orden */}
      <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <CalendarRange size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Ranking por mes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Qué meses facturaron más · USD</p>
          </div>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1 self-start sm:self-auto">
          <button
            onClick={() => setOrden("monto")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              orden === "monto" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Mejores meses
          </button>
          <button
            onClick={() => setOrden("fecha")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              orden === "fecha" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Cronológico
          </button>
        </div>
      </div>

      {conIngresos.length === 0 ? (
        <div className="px-5 pb-8 pt-2 text-center">
          <p className="text-sm text-gray-400">Todavía no hay ingresos registrados.</p>
        </div>
      ) : (
        <>
          {/* Resumen de la ventana */}
          <div className="grid grid-cols-3 border-y border-gray-100 bg-gray-50/50 divide-x divide-gray-100">
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Mejor mes</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{mejor ? usd(mejor.total) : "—"}</p>
              <p className="text-[11px] text-gray-500 mt-0.5 first-letter:uppercase">{mejor?.label ?? ""}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Promedio mensual</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{usd(promedio)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{conIngresos.length} meses con ingresos</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total período</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{usd(total)}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{todo ? "todo el historial" : "últimos 12 meses"}</p>
            </div>
          </div>

          {/* Filas */}
          <div className="divide-y divide-gray-50">
            {visibles.map((m) => {
              const pos   = posicion.get(m.key) ?? 0
              const ancho = maximo > 0 ? (m.total / maximo) * 100 : 0
              const vari  = variacion(m)
              return (
                <div key={m.key} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      m.total > 0 ? (MEDALLA[pos] ?? "bg-gray-50 text-gray-400") : "bg-gray-50 text-gray-300"
                    }`}>
                      {m.total > 0 ? pos : "—"}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm first-letter:uppercase truncate">{m.label}</p>
                        {vari !== null && (
                          <span className={`shrink-0 inline-flex items-center gap-0.5 text-[11px] font-semibold ${
                            vari > 0.5 ? "text-emerald-600" : vari < -0.5 ? "text-rose-600" : "text-gray-400"
                          }`}>
                            {vari > 0.5 ? <TrendingUp size={11} /> : vari < -0.5 ? <TrendingDown size={11} /> : <Minus size={11} />}
                            {vari > 0 ? "+" : ""}{vari.toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* Barra apilada: largo = peso frente al mejor mes. */}
                      <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${m.total > 0 ? Math.max(ancho, 2) : 0}%` }}>
                          {VERTICALES.map(v => {
                            const parte = m.total > 0 ? (m[v.k] / m.total) * 100 : 0
                            if (parte <= 0) return null
                            return (
                              <div
                                key={v.k}
                                className={v.bar}
                                style={{ width: `${parte}%` }}
                                title={`${v.label}: ${usd(m[v.k])}`}
                              />
                            )
                          })}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-500 mt-1.5">
                        {m.total > 0
                          ? <>{m.clientes} cliente{m.clientes === 1 ? "" : "s"} · {m.pagos} pago{m.pagos === 1 ? "" : "s"}</>
                          : "sin ingresos"}
                      </p>
                    </div>

                    <p className={`shrink-0 text-sm font-bold tabular-nums ${m.total > 0 ? "text-gray-900" : "text-gray-300"}`}>
                      {usd(m.total)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Leyenda + ampliar a todo el historial */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {VERTICALES.map(v => {
              const suma = ventana.reduce((s, m) => s + m[v.k], 0)
              return (
                <span key={v.k} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                  {v.label}
                  <span className="font-semibold text-gray-700">{usd(suma)}</span>
                </span>
              )
            })}
            {meses.length > 12 && (
              <button
                onClick={() => setTodo(!todo)}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 sm:ml-auto"
              >
                {todo ? "Ver últimos 12 meses" : `Ver todo el historial (${meses.length} meses)`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
