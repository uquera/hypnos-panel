"use client"

import { useState } from "react"
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, ArrowDownRight } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MesData {
  key: string; label: string
  ingresos: number; gastos: number; margen: number; pct: number | null
  licencia: number; marketing: number; desarrollo: number
}

interface Props {
  meses:         MesData[]
  mesActualKey:  string
  kpis: {
    mesActual:           MesData
    variacionIngresos:   number | null
    variacionGastos:     number | null
    acumIngresos:        number
    acumGastos:          number
    acumMargen:          number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n)
}
function pctColor(pct: number | null) {
  if (pct === null) return "text-gray-400"
  if (pct >= 50) return "text-emerald-600"
  if (pct >= 20) return "text-yellow-600"
  if (pct >= 0)  return "text-amber-500"
  return "text-rose-400"
}
function margenColor(m: number) {
  if (m > 0) return "text-emerald-600"
  if (m < 0) return "text-rose-400"
  return "text-gray-500"
}

// ─── Gráfico combinado ────────────────────────────────────────────────────────

function BalanceChart({ meses, mesActualKey }: { meses: MesData[]; mesActualKey: string }) {
  const [tooltip, setTooltip] = useState<number | null>(null)
  const maxVal = Math.max(...meses.flatMap(m => [m.ingresos, m.gastos]), 1)

  return (
    <div className="relative">
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500" />Ingresos</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-400" />Gastos</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500" />Margen</span>
      </div>

      <div className="flex items-end gap-2 h-48">
        {meses.map((m, i) => {
          const isActual = m.key === mesActualKey
          const ingPct   = (m.ingresos / maxVal) * 100
          const gastPct  = (m.gastos   / maxVal) * 100
          return (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
              onMouseEnter={() => setTooltip(i)} onMouseLeave={() => setTooltip(null)}>
              <div className="w-full flex items-end gap-0.5 justify-center" style={{ height: "180px" }}>
                {/* Barra ingresos */}
                <div className="flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max(ingPct, m.ingresos > 0 ? 2 : 0)}%`,
                    background: isActual ? "#4f46e5" : "#a5b4fc",
                    opacity: isActual ? 1 : 0.7,
                    minHeight: m.ingresos > 0 ? "3px" : "0",
                  }} />
                {/* Barra gastos */}
                <div className="flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max(gastPct, m.gastos > 0 ? 2 : 0)}%`,
                    background: isActual ? "#fb7185" : "#fda4af",
                    opacity: isActual ? 1 : 0.7,
                    minHeight: m.gastos > 0 ? "3px" : "0",
                  }} />
              </div>
              <span className="text-[9px] text-gray-400 truncate w-full text-center leading-none">{m.label}</span>
            </div>
          )
        })}
      </div>

      {tooltip !== null && (
        <div className="absolute -top-2 pointer-events-none z-10 bg-gray-900 text-white text-xs px-3 py-2 rounded-xl shadow-lg whitespace-nowrap"
          style={{ left: `${((tooltip + 0.5) / meses.length) * 100}%`, transform: "translateX(-50%)" }}>
          <p className="font-semibold mb-1">{meses[tooltip].label}</p>
          <p className="text-indigo-300">Ingresos: {formatUSD(meses[tooltip].ingresos)}</p>
          <p className="text-rose-300">Gastos: {formatUSD(meses[tooltip].gastos)}</p>
          <p className={`border-t border-gray-700 mt-1 pt-1 font-semibold ${meses[tooltip].margen >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            Margen: {formatUSD(meses[tooltip].margen)}
            {meses[tooltip].pct !== null && ` (${meses[tooltip].pct}%)`}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BalanceClient({ meses, mesActualKey, kpis }: Props) {
  const { mesActual, variacionIngresos, variacionGastos, acumIngresos, acumGastos, acumMargen } = kpis

  const IngIcon  = variacionIngresos === null ? Minus : variacionIngresos > 0 ? TrendingUp  : TrendingDown
  const GastIcon = variacionGastos   === null ? Minus : variacionGastos   > 0 ? TrendingUp : TrendingDown
  const ingColor  = variacionIngresos === null ? "text-gray-400" : variacionIngresos  > 0 ? "text-emerald-600" : "text-rose-400"
  const gastColor = variacionGastos   === null ? "text-gray-400" : variacionGastos   > 0 ? "text-rose-400"    : "text-emerald-600"

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Balance general</h1>
        <p className="text-sm text-gray-500 mt-0.5">P&L mensual — ingresos vs. gastos operativos</p>
      </div>

      {/* KPIs mes actual */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Ingresos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium mb-1">Ingresos este mes</p>
          <p className="text-2xl font-bold text-indigo-700">{formatUSD(mesActual.ingresos)}</p>
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${ingColor}`}>
            <IngIcon size={12} />
            {variacionIngresos === null ? "Sin referencia" : `${variacionIngresos > 0 ? "+" : ""}${variacionIngresos}% vs mes ant.`}
          </div>
        </div>

        {/* Gastos */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs text-gray-500 font-medium mb-1">Gastos este mes</p>
          <p className="text-2xl font-bold text-rose-400">{formatUSD(mesActual.gastos)}</p>
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${gastColor}`}>
            <GastIcon size={12} />
            {variacionGastos === null ? "Sin referencia" : `${variacionGastos > 0 ? "+" : ""}${variacionGastos}% vs mes ant.`}
          </div>
        </div>

        {/* Margen mes */}
        <div className={`bg-white rounded-2xl border shadow-sm p-4 ${mesActual.margen >= 0 ? "border-emerald-200" : "border-red-200"}`}>
          <p className="text-xs text-gray-500 font-medium mb-1">Margen este mes</p>
          <p className={`text-2xl font-bold ${margenColor(mesActual.margen)}`}>{formatUSD(mesActual.margen)}</p>
          {mesActual.pct !== null && (
            <p className={`text-xs font-semibold mt-1 ${pctColor(mesActual.pct)}`}>
              {mesActual.pct}% del ingreso
            </p>
          )}
        </div>

        {/* Margen acumulado año */}
        <div className={`bg-white rounded-2xl border shadow-sm p-4 ${acumMargen >= 0 ? "border-emerald-100" : "border-red-100"}`}>
          <p className="text-xs text-gray-500 font-medium mb-1">Margen acum. año</p>
          <p className={`text-2xl font-bold ${margenColor(acumMargen)}`}>{formatUSD(acumMargen)}</p>
          <p className="text-xs text-gray-400 mt-1">
            {formatUSD(acumIngresos)} ing. · {formatUSD(acumGastos)} gast.
          </p>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-800 mb-4">Ingresos vs Gastos — últimos {meses.length} meses</h2>
        <BalanceChart meses={meses} mesActualKey={mesActualKey} />
      </div>

      {/* Tabla mensual */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Detalle por mes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">Mes</th>
                <th className="px-5 py-3 text-right text-indigo-600">Mensualidad</th>
                <th className="px-5 py-3 text-right text-purple-600">Marketing</th>
                <th className="px-5 py-3 text-right text-teal-600">Desarrollo</th>
                <th className="px-5 py-3 text-right border-l border-gray-200">Total ingresos</th>
                <th className="px-5 py-3 text-right text-red-500">Gastos</th>
                <th className="px-5 py-3 text-right border-l border-gray-200">Margen</th>
                <th className="px-5 py-3 text-right">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...meses].reverse().map(m => {
                const esActual = m.key === mesActualKey
                return (
                  <tr key={m.key} className={`transition-colors ${esActual ? "bg-indigo-50/50" : "hover:bg-gray-50/50"}`}>
                    <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-nowrap">
                      {esActual && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full mr-2">Hoy</span>}
                      {m.label}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-600">{m.licencia > 0 ? formatUSD(m.licencia) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3.5 text-right text-gray-600">{m.marketing > 0 ? formatUSD(m.marketing) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3.5 text-right text-gray-600">{m.desarrollo > 0 ? formatUSD(m.desarrollo) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3.5 text-right font-semibold text-indigo-700 border-l border-gray-100">{m.ingresos > 0 ? formatUSD(m.ingresos) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-rose-400">{m.gastos > 0 ? formatUSD(m.gastos) : <span className="text-gray-300">—</span>}</td>
                    <td className={`px-5 py-3.5 text-right font-semibold border-l border-gray-100 ${margenColor(m.margen)}`}>
                      <span className="flex items-center justify-end gap-1">
                        {m.margen > 0 ? <ArrowUpRight size={13} /> : m.margen < 0 ? <ArrowDownRight size={13} /> : null}
                        {m.ingresos > 0 || m.gastos > 0 ? formatUSD(m.margen) : <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    <td className={`px-5 py-3.5 text-right text-xs font-bold ${pctColor(m.pct)}`}>
                      {m.pct !== null ? `${m.pct}%` : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Totales anuales */}
            {(() => {
              const anioMeses = meses.filter(m => m.key.startsWith(String(new Date().getFullYear())))
              const totIng    = anioMeses.reduce((s, m) => s + m.ingresos,  0)
              const totGast   = anioMeses.reduce((s, m) => s + m.gastos,    0)
              const totMarg   = totIng - totGast
              const totPct    = totIng > 0 ? Math.round((totMarg / totIng) * 100) : null
              const totLic    = anioMeses.reduce((s, m) => s + m.licencia,  0)
              const totMkt    = anioMeses.reduce((s, m) => s + m.marketing, 0)
              const totDev    = anioMeses.reduce((s, m) => s + m.desarrollo, 0)
              return (
                <tfoot>
                  <tr className="bg-gray-900 text-white text-xs font-bold">
                    <td className="px-5 py-3">Total {new Date().getFullYear()}</td>
                    <td className="px-5 py-3 text-right opacity-80">{totLic > 0 ? formatUSD(totLic) : "—"}</td>
                    <td className="px-5 py-3 text-right opacity-80">{totMkt > 0 ? formatUSD(totMkt) : "—"}</td>
                    <td className="px-5 py-3 text-right opacity-80">{totDev > 0 ? formatUSD(totDev) : "—"}</td>
                    <td className="px-5 py-3 text-right border-l border-gray-700 text-indigo-300">{formatUSD(totIng)}</td>
                    <td className="px-5 py-3 text-right text-rose-400">{formatUSD(totGast)}</td>
                    <td className={`px-5 py-3 text-right border-l border-gray-700 ${totMarg >= 0 ? "text-emerald-300" : "text-rose-400"}`}>{formatUSD(totMarg)}</td>
                    <td className={`px-5 py-3 text-right ${pctColor(totPct)}`}>{totPct !== null ? `${totPct}%` : "—"}</td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      </div>
    </div>
  )
}
