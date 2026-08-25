"use client"

import { useState, useMemo } from "react"
import { Inbox, Search, Download, Trash2, MessageCircle, Mail, Image as ImageIcon } from "lucide-react"
import { ESTADOS, ESTADO_META, type Estado } from "@/lib/leads"

interface Lead {
  id:        string
  negocio:   string
  tipo:      string
  nombre:    string
  whatsapp:  string
  email:     string
  origen:    string
  conLogo:   boolean
  estado:    string
  notas:     string | null
  createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return "ahora"
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  const days = Math.floor(h / 24)
  if (days === 1) return "ayer"
  if (days < 7)   return `hace ${days} días`
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
}

function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

/** wa.me exige solo dígitos con código de país. Asume Chile si vienen 9 dígitos. */
function waLink(whatsapp: string): string | null {
  let d = whatsapp.replace(/\D/g, "")
  if (d.length < 8) return null
  if (d.length === 9 && d.startsWith("9")) d = "56" + d
  return `https://wa.me/${d}`
}

function csvCell(v: string | boolean): string {
  const s = String(v ?? "")
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function LeadsClient({ leads: iniciales, isAdmin }: { leads: Lead[]; isAdmin: boolean }) {
  const [leads,    setLeads]    = useState(iniciales)
  const [filtro,   setFiltro]   = useState<"todos" | Estado>("todos")
  const [busqueda, setBusqueda] = useState("")
  const [guardando, setGuardando] = useState<string | null>(null)
  const [error,    setError]    = useState("")

  const conteos = useMemo(() => {
    const c: Record<string, number> = { todos: leads.length }
    for (const e of ESTADOS) c[e] = leads.filter(l => l.estado === e).length
    return c
  }, [leads])

  const filtrados = useMemo(() => {
    return leads.filter(l => {
      if (filtro !== "todos" && l.estado !== filtro) return false
      if (busqueda) {
        const q = busqueda.toLowerCase()
        const hay = [l.negocio, l.nombre, l.email, l.whatsapp, l.tipo, l.origen, l.notas]
          .filter(Boolean).join(" ").toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [leads, filtro, busqueda])

  async function actualizar(id: string, cambios: { estado?: string; notas?: string }) {
    const previo = leads.find(l => l.id === id)
    if (!previo) return

    // Optimista: la UI responde al instante y revierte solo si el servidor falla.
    setLeads(ls => ls.map(l => (l.id === id ? { ...l, ...cambios } : l)))
    setGuardando(id)
    setError("")

    try {
      const r = await fetch(`/api/leads/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(cambios),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? "No se pudo guardar")
      }
    } catch (e) {
      setLeads(ls => ls.map(l => (l.id === id ? previo : l)))
      setError(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setGuardando(null)
    }
  }

  async function eliminar(id: string, negocio: string) {
    if (!confirm(`¿Eliminar el lead de "${negocio}"? Esta acción no se puede deshacer.`)) return
    const previos = leads
    setLeads(ls => ls.filter(l => l.id !== id))
    setError("")
    try {
      const r = await fetch(`/api/leads/${id}`, { method: "DELETE" })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? "No se pudo eliminar")
      }
    } catch (e) {
      setLeads(previos)
      setError(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  function exportarCSV() {
    const cab = ["Fecha", "Negocio", "Rubro", "Contacto", "WhatsApp", "Email", "Origen", "Estado", "Notas"]
    const filas = filtrados.map(l => [
      fmtFecha(l.createdAt), l.negocio, l.tipo, l.nombre,
      l.whatsapp, l.email, l.origen, ESTADO_META[l.estado as Estado]?.label ?? l.estado, l.notas ?? "",
    ].map(csvCell).join(","))

    // BOM para que Excel en español respete los acentos
    const blob = new Blob(["﻿" + [cab.join(","), ...filas].join("\n")], {
      type: "text/csv;charset=utf-8;",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `leads-hypnos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Inbox size={22} className="text-indigo-600" />
            Leads
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Solicitudes que llegan del formulario de la landing
          </p>
        </div>
        {leads.length > 0 && (
          <button
            onClick={exportarCSV}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Download size={14} />
            Exportar CSV
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { key: "NUEVO",           label: "Sin contactar", color: "text-indigo-600",  bg: "bg-indigo-50" },
          { key: "EN_CONVERSACION", label: "En conversación", color: "text-amber-600", bg: "bg-amber-50" },
          { key: "GANADO",          label: "Ganados",       color: "text-emerald-600", bg: "bg-emerald-50" },
          { key: "todos",           label: "Total",         color: "text-gray-700",    bg: "bg-gray-50" },
        ] as const).map(({ key, label, color, bg }) => (
          <div key={key} className={`${bg} rounded-xl px-4 py-3`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${color}`}>{conteos[key] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Panel */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm">

        {/* Tabs de estado */}
        <div className="flex border-b border-gray-100 px-4 pt-3 gap-1 overflow-x-auto">
          {(["todos", ...ESTADOS] as const).map(k => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={[
                "px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap",
                filtro === k
                  ? "border-indigo-500 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {k === "todos" ? "Todos" : ESTADO_META[k].label}
              <span className="ml-1.5 text-xs text-gray-400">({conteos[k] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por negocio, contacto, correo, notas…"
              className="text-sm outline-none flex-1 placeholder:text-gray-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda("")} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            )}
          </div>
        </div>

        {/* Tabla */}
        {filtrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {leads.length === 0
              ? "Todavía no llega ningún lead desde la landing"
              : "No hay leads con los filtros aplicados"}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/70 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    <th className="px-5 py-3 text-left w-28">Fecha</th>
                    <th className="px-4 py-3 text-left">Negocio</th>
                    <th className="px-4 py-3 text-left w-52">Contacto</th>
                    <th className="px-4 py-3 text-left w-40">Estado</th>
                    <th className="px-4 py-3 text-left w-56">Notas</th>
                    {isAdmin && <th className="px-4 py-3 w-12" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtrados.map(l => {
                    const meta = ESTADO_META[l.estado as Estado]
                    const wa   = waLink(l.whatsapp)
                    return (
                      <tr key={l.id} className="hover:bg-gray-50/50 transition-colors group align-top">

                        {/* Fecha */}
                        <td className="px-5 py-3">
                          <span className="text-gray-700 font-medium text-xs">{timeAgo(l.createdAt)}</span>
                          <p className="text-gray-400 text-xs leading-tight mt-0.5 hidden group-hover:block">
                            {fmtFecha(l.createdAt)}
                          </p>
                        </td>

                        {/* Negocio */}
                        <td className="px-4 py-3">
                          <p className="text-gray-900 font-medium flex items-center gap-1.5">
                            {l.negocio}
                            {l.conLogo && (
                              <span title="Subió su logo en el demo">
                                <ImageIcon size={12} className="text-indigo-400" />
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {l.tipo || "—"}
                            {l.origen && l.origen !== "landing" && (
                              <span className="ml-1.5 text-gray-300">· {l.origen}</span>
                            )}
                          </p>
                        </td>

                        {/* Contacto */}
                        <td className="px-4 py-3">
                          <p className="text-gray-700">{l.nombre}</p>
                          <div className="flex flex-col gap-0.5 mt-1">
                            {wa && (
                              <a href={wa} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1 w-fit">
                                <MessageCircle size={11} />
                                {l.whatsapp}
                              </a>
                            )}
                            {l.email && (
                              <a href={`mailto:${l.email}`}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 w-fit truncate">
                                <Mail size={11} className="shrink-0" />
                                <span className="truncate">{l.email}</span>
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Estado */}
                        <td className="px-4 py-3">
                          <select
                            value={l.estado}
                            disabled={guardando === l.id}
                            onChange={e => actualizar(l.id, { estado: e.target.value })}
                            className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50 ${meta?.badge ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {ESTADOS.map(e => (
                              <option key={e} value={e}>{ESTADO_META[e].label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Notas */}
                        <td className="px-4 py-3">
                          <textarea
                            defaultValue={l.notas ?? ""}
                            rows={2}
                            placeholder="Seguimiento…"
                            onBlur={e => {
                              const v = e.target.value.trim()
                              if (v !== (l.notas ?? "")) actualizar(l.id, { notas: v })
                            }}
                            className="w-full text-xs text-gray-600 border border-transparent hover:border-gray-200 focus:border-indigo-300 rounded-lg px-2 py-1 resize-y outline-none placeholder:text-gray-300 bg-transparent focus:bg-white transition-colors"
                          />
                        </td>

                        {/* Eliminar */}
                        {isAdmin && (
                          <td className="px-4 py-3">
                            <button
                              onClick={() => eliminar(l.id, l.negocio)}
                              title="Eliminar lead"
                              className="p-1.5 rounded-lg text-gray-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Mostrando {filtrados.length} de {leads.length} leads
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
