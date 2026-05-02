"use client"

import { useState } from "react"
import { Activity, Loader2, Wifi, WifiOff, RefreshCw } from "lucide-react"
import type { HealthResult } from "@/app/api/health-check/route"

interface ClienteBasic {
  id:          string
  nombre:      string
  ultimoCheck: string | null
  ultimoCheckOk: boolean | null
}

export default function HealthMonitor({ clientes }: { clientes: ClienteBasic[] }) {
  const [results, setResults]   = useState<Record<string, HealthResult>>({})
  const [loading, setLoading]   = useState(false)
  const [checked, setChecked]   = useState(false)
  const [lastRun, setLastRun]   = useState<string | null>(null)

  async function verificar() {
    setLoading(true)
    try {
      const res  = await fetch("/api/health-check")
      const data = await res.json()
      if (data.ok) {
        const map: Record<string, HealthResult> = {}
        for (const r of data.results as HealthResult[]) map[r.clienteId] = r
        setResults(map)
        setChecked(true)
        setLastRun(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }))
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }

  function statusDot(clienteId: string, ultimoCheckOk: boolean | null) {
    const r = results[clienteId]
    if (!checked && ultimoCheckOk === null) return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" title="Sin verificar" />
    if (!checked && ultimoCheckOk !== null) {
      return <span className={`w-2 h-2 rounded-full inline-block ${ultimoCheckOk ? "bg-emerald-400" : "bg-red-400"}`} title={ultimoCheckOk ? "Online (último check)" : "Offline (último check)"} />
    }
    if (!r) return <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
    return <span
      className={`w-2 h-2 rounded-full inline-block ${r.online ? "bg-emerald-400" : "bg-red-400"}`}
      title={r.online ? `Online · ${r.latencia}ms` : `Offline · ${r.error}`}
    />
  }

  const onlineCount  = checked ? Object.values(results).filter(r => r.online).length : null
  const offlineCount = checked ? Object.values(results).filter(r => !r.online).length : null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-800">Estado de clientes</h2>
          {checked && (
            <span className="text-xs text-gray-400 ml-1">· {lastRun}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {checked && (
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-600 font-medium">
                <Wifi size={12} /> {onlineCount} online
              </span>
              {(offlineCount ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-red-500 font-medium">
                  <WifiOff size={12} /> {offlineCount} offline
                </span>
              )}
            </div>
          )}
          <button
            onClick={verificar}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {loading ? "Verificando…" : "Verificar ahora"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {clientes.map(c => {
          const r = results[c.id]
          return (
            <div
              key={c.id}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                !checked
                  ? "border-gray-100 bg-gray-50"
                  : r?.online
                  ? "border-emerald-100 bg-emerald-50"
                  : "border-red-100 bg-red-50"
              }`}
            >
              {statusDot(c.id, c.ultimoCheckOk)}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-800 truncate text-xs">{c.nombre}</p>
                {checked && r && (
                  <p className={`text-[10px] ${r.online ? "text-emerald-600" : "text-red-500"}`}>
                    {r.online ? `${r.latencia}ms` : r.error ?? "Offline"}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
