"use client"

import { useState } from "react"
import Link from "next/link"
import { Trophy } from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TramoIngresos {
  licencia:   number
  marketing:  number
  desarrollo: number
  total:      number
}

export interface RankingCliente {
  id:          string
  nombre:      string
  plan:        string
  activo:      boolean
  pagos:       number        // cantidad de pagos históricos
  mesesActivo: number        // meses desde el primer pago (mínimo 1)
  mes:         TramoIngresos
  anio:        TramoIngresos
  hist:        TramoIngresos
}

type Scope = "mes" | "anio" | "hist"

const SCOPES: { k: Scope; label: string; corto: string }[] = [
  { k: "mes",  label: "Este mes",         corto: "Mes" },
  { k: "anio", label: "Últimos 12 meses", corto: "12 meses" },
  { k: "hist", label: "Histórico",        corto: "Histórico" },
]

// Mismos colores que las verticales en Pagos: mensualidad indigo, marketing
// púrpura, desarrollo teal. Así el color significa lo mismo en todo el panel.
const VERTICALES = [
  { k: "licencia"   as const, label: "Mensualidad", bar: "bg-indigo-500", dot: "bg-indigo-500" },
  { k: "marketing"  as const, label: "Marketing",   bar: "bg-purple-500", dot: "bg-purple-500" },
  { k: "desarrollo" as const, label: "Desarrollo",  bar: "bg-teal-500",   dot: "bg-teal-500"   },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usd(monto: number): string {
  return "$" + monto.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const MEDALLA: Record<number, string> = {
  1: "bg-amber-100 text-amber-700 ring-1 ring-amber-300",
  2: "bg-gray-100 text-gray-600 ring-1 ring-gray-300",
  3: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function RankingClientes({ clientes }: { clientes: RankingCliente[] }) {
  const [scope, setScope] = useState<Scope>("hist")

  const tramo = (c: RankingCliente): TramoIngresos =>
    scope === "mes" ? c.mes : scope === "anio" ? c.anio : c.hist

  const ordenados    = [...clientes].sort((a, b) => tramo(b).total - tramo(a).total)
  const conIngresos  = ordenados.filter(c => tramo(c).total > 0)
  const sinIngresos  = ordenados.length - conIngresos.length

  const total    = conIngresos.reduce((s, c) => s + tramo(c).total, 0)
  const maximo   = conIngresos.length > 0 ? tramo(conIngresos[0]).total : 0
  const promedio = conIngresos.length > 0 ? total / conIngresos.length : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* Encabezado + selector de período */}
      <div className="px-5 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Trophy size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Ranking por ingresos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cuánto ha generado cada cliente · USD</p>
          </div>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1 self-start sm:self-auto">
          {SCOPES.map(s => (
            <button
              key={s.k}
              onClick={() => setScope(s.k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                scope === s.k ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{s.corto}</span>
            </button>
          ))}
        </div>
      </div>

      {conIngresos.length === 0 ? (
        <div className="px-5 pb-8 pt-2 text-center">
          <p className="text-sm text-gray-400">Sin ingresos registrados en este período.</p>
        </div>
      ) : (
        <>
          {/* Resumen del período */}
          <div className="grid grid-cols-3 border-y border-gray-100 bg-gray-50/50 divide-x divide-gray-100">
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Total</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{usd(total)}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Promedio</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{usd(promedio)}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Clientes</p>
              <p className="text-base font-bold text-gray-900 mt-0.5">{conIngresos.length}</p>
            </div>
          </div>

          {/* Filas del ranking */}
          <div className="divide-y divide-gray-50">
            {conIngresos.map((c, i) => {
              const t     = tramo(c)
              const pos   = i + 1
              const share = total  > 0 ? (t.total / total)  * 100 : 0
              const ancho = maximo > 0 ? (t.total / maximo) * 100 : 0
              return (
                <Link
                  key={c.id}
                  href={`/admin/clientes/${c.id}`}
                  className="block px-5 py-3.5 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                      MEDALLA[pos] ?? "bg-gray-50 text-gray-400"
                    }`}>
                      {pos}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 text-sm truncate">{c.nombre}</p>
                        <span className="shrink-0 hidden sm:inline-flex px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                          {c.plan}
                        </span>
                        {!c.activo && (
                          <span className="shrink-0 inline-flex px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-semibold">
                            archivado
                          </span>
                        )}
                      </div>

                      {/* Barra apilada: el largo es el peso frente al nº1 y los
                          segmentos son la mezcla de verticales de ese cliente. */}
                      <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full flex rounded-full overflow-hidden" style={{ width: `${Math.max(ancho, 2)}%` }}>
                          {VERTICALES.map(v => {
                            const parte = t.total > 0 ? (t[v.k] / t.total) * 100 : 0
                            if (parte <= 0) return null
                            return (
                              <div
                                key={v.k}
                                className={v.bar}
                                style={{ width: `${parte}%` }}
                                title={`${v.label}: ${usd(t[v.k])}`}
                              />
                            )
                          })}
                        </div>
                      </div>

                      <p className="text-[11px] text-gray-500 mt-1.5">
                        {share.toFixed(1)}% del total
                        {scope === "hist" && (
                          <>
                            {" · "}{c.pagos} pago{c.pagos === 1 ? "" : "s"}
                            {" · "}{usd(t.total / c.mesesActivo)}/mes prom.
                          </>
                        )}
                      </p>
                    </div>

                    <p className="shrink-0 text-sm font-bold text-gray-900 tabular-nums">{usd(t.total)}</p>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Leyenda: cuánto aporta cada vertical en el período */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {VERTICALES.map(v => {
              const suma = conIngresos.reduce((s, c) => s + tramo(c)[v.k], 0)
              return (
                <span key={v.k} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                  {v.label}
                  <span className="font-semibold text-gray-700">{usd(suma)}</span>
                </span>
              )
            })}
            {sinIngresos > 0 && (
              <span className="text-[11px] text-gray-500 sm:ml-auto">
                {sinIngresos} cliente{sinIngresos === 1 ? "" : "s"} sin ingresos en el período
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
