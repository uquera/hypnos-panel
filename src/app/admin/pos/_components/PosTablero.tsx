"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ExternalLink, Search, Store, MessageCircle, Loader2, RotateCcw, PauseCircle, PlayCircle, Banknote, FileClock } from "lucide-react"
import type { FilaTablero } from "@/lib/pos/tablero"
import { accionPos } from "./accionPos"

const FILTROS: { id: string; label: string; estados: string[] }[] = [
  { id: "todos",      label: "Todos",       estados: [] },
  { id: "instalando", label: "Instalando",  estados: ["INSTALANDO"] },
  { id: "prueba",     label: "En prueba",   estados: ["EN_PRUEBA"] },
  { id: "aldia",      label: "Al día",      estados: ["AL_DIA"] },
  { id: "porvencer",  label: "Por vencer",  estados: ["POR_VENCER"] },
  { id: "vencido",    label: "Vencidos",    estados: ["VENCIDO"] },
  { id: "suspendido", label: "Suspendidos", estados: ["SUSPENDIDO"] },
  { id: "error",      label: "Error",       estados: ["ERROR"] },
  { id: "manual",     label: "Manual",      estados: ["MANUAL"] },
  { id: "eliminadas", label: "Eliminadas",  estados: ["ELIMINADA"] },
]

export const COLOR_ESTADO: Record<string, string> = {
  AL_DIA:     "bg-green-100 text-green-700",
  EN_PRUEBA:  "bg-sky-100 text-sky-700",
  POR_VENCER: "bg-amber-100 text-amber-700",
  VENCIDO:    "bg-rose-100 text-rose-700",
  SUSPENDIDO: "bg-red-100 text-red-700",
  INSTALANDO: "bg-indigo-100 text-indigo-700",
  ERROR:      "bg-red-100 text-red-700",
  MANUAL:     "bg-gray-100 text-gray-600",
  ELIMINADA:  "bg-gray-200 text-gray-500",
}

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)
const fecha = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Santiago" }) : "—"
const host = (u: string) => { try { const x = new URL(u); return x.host + x.pathname.replace(/\/$/, "") } catch { return u } }
const wa = (v: string) => { let d = v.replace(/\D/g, ""); if (d.length === 9 && d.startsWith("9")) d = "56" + d; return d }

export function EstadoBadge({ f }: { f: Pick<FilaTablero, "estado" | "etiqueta" | "estancada"> }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${COLOR_ESTADO[f.estado] ?? "bg-gray-100 text-gray-600"}`}>
      {f.estado === "INSTALANDO" && !f.estancada && <Loader2 size={11} className="animate-spin" />}
      {f.etiqueta}{f.estancada ? " (estancada)" : ""}
    </span>
  )
}

function Origen({ origen }: { origen: string }) {
  return origen === "REGISTRO"
    ? <span className="text-[11px] font-medium text-sky-600">Registro web</span>
    : <span className="text-[11px] font-medium text-gray-400">Creado por Hypnos</span>
}

function Logo({ f, size = 36 }: { f: FilaTablero; size?: number }) {
  return f.logoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={f.logoUrl} alt="" className="rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ width: size, height: size, background: f.colorPrimario }}>{f.nombre.charAt(0)}</div>
}

function Acciones({ f }: { f: FilaTablero }) {
  const router = useRouter()
  const [loading, setLoading] = useState("")
  const run = async (clave: string, body: Record<string, unknown>, ok: string) => {
    setLoading(clave)
    const d = await accionPos(f.id, body)
    setLoading("")
    if (d) { toast.success(ok); router.refresh() }
  }
  const btn = "inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
  if (f.eliminada) return null
  return (
    <div className="flex items-center gap-0.5 justify-end">
      {f.estadoAlta === "LISTO" || f.manual
        ? <a href={f.posUrl} target="_blank" rel="noreferrer" className={btn} title="Abrir sistema"><ExternalLink size={15} /></a>
        : null}
      {f.tieneLicencia && f.estado !== "INSTALANDO" && f.estado !== "ERROR" && (
        <button type="button" className={btn} title={`Registrar pago (${clp(f.precio)})`} disabled={!!loading}
          onClick={() => {
            const m = prompt(`Monto recibido de ${f.nombre} (CLP). Extiende 1 mes y avisa al dueño:`, String(f.precio))
            if (m && Number(m.replace(/[^\d]/g, "")) > 0) run("pago", { accion: "pago-manual", monto: m }, "Pago registrado")
          }}>
          {loading === "pago" ? <Loader2 size={15} className="animate-spin" /> : <Banknote size={15} />}
        </button>
      )}
      {f.tieneLicencia && f.estadoAlta !== "ERROR" && (
        f.suspendida
          ? <button type="button" className={btn} title="Reactivar" disabled={!!loading} onClick={() => run("sus", { accion: "reactivar" }, "Reactivado")}>
              {loading === "sus" ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} className="text-green-600" />}
            </button>
          : <button type="button" className={btn} title="Suspender" disabled={!!loading}
              onClick={() => confirm(`¿Suspender ${f.nombre}? Su sistema dejará de funcionar hasta reactivarlo.`) && run("sus", { accion: "suspender" }, "Suspendido")}>
              {loading === "sus" ? <Loader2 size={15} className="animate-spin" /> : <PauseCircle size={15} className="text-red-500" />}
            </button>
      )}
      {(f.estadoAlta === "ERROR" || f.estancada) && (
        <button type="button" className={btn} title="Reintentar instalación" disabled={!!loading} onClick={() => run("re", { accion: "reintentar" }, "Instalación relanzada")}>
          {loading === "re" ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
        </button>
      )}
    </div>
  )
}

export default function PosTablero({ filas }: { filas: FilaTablero[] }) {
  const [q, setQ] = useState("")
  const [filtro, setFiltro] = useState("todos")

  const conteo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const F of FILTROS) {
      m[F.id] = F.id === "todos" ? filas.filter(f => !f.eliminada).length : filas.filter(f => F.estados.includes(f.estado)).length
    }
    return m
  }, [filas])

  const lista = useMemo(() => {
    const F = FILTROS.find(x => x.id === filtro)!
    const t = q.trim().toLowerCase()
    return filas
      .filter(f => F.id === "todos" ? !f.eliminada : F.estados.includes(f.estado))
      .filter(f => !t || [f.nombre, f.codigo, f.posUrl, f.dueno ?? "", f.email ?? "", f.whatsapp].some(v => v.toLowerCase().includes(t)))
  }, [q, filtro, filas])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.filter(F => F.id === "todos" || conteo[F.id] > 0 || F.id === filtro).map(F => (
          <button key={F.id} type="button" onClick={() => setFiltro(F.id)}
            className={`px-3 h-8 rounded-full text-xs font-semibold transition-colors ${filtro === F.id ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {F.label} <span className="opacity-60">{conteo[F.id]}</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por restaurante, código, dueño, correo o WhatsApp"
          className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
      </div>

      {lista.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <Store size={28} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-500 mt-2">{filas.length ? "Ningún restaurante coincide." : "Aún no hay restaurantes."}</p>
        </div>
      )}

      {/* Cards — móvil */}
      <div className="md:hidden space-y-3">
        {lista.map(f => (
          <div key={f.id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 ${f.eliminada ? "opacity-60" : ""}`}>
            <Link href={`/admin/pos/${f.id}`} className="flex items-center gap-3">
              <Logo f={f} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{f.nombre}</p>
                <p className="text-xs text-gray-500 font-mono truncate">{f.codigo}</p>
              </div>
              <EstadoBadge f={f} />
            </Link>
            <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-1 text-xs text-gray-500">
              <span className="truncate">{f.dueno ?? "—"}</span>
              <span className="text-right">Vence {fecha(f.vence)}</span>
              <Origen origen={f.origen} />
              <span className="text-right">{f.pendientes > 0 ? <span className="text-amber-700 font-semibold">{f.pendientes} comprobante(s)</span> : f.ultimoPago ? `Pagó ${fecha(f.ultimoPago.fecha)}` : "Sin pagos"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              {f.whatsapp ? <a href={`https://wa.me/${wa(f.whatsapp)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700"><MessageCircle size={13} /> {f.whatsapp}</a> : <span />}
              <Acciones f={f} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabla — desktop */}
      {lista.length > 0 && (
        <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-xs uppercase tracking-wide text-gray-500">
                <th className="text-left px-4 py-3 font-semibold">Restaurante</th>
                <th className="text-left px-3 py-3 font-semibold">Dueño</th>
                <th className="text-left px-3 py-3 font-semibold">Estado</th>
                <th className="text-left px-3 py-3 font-semibold">Vence</th>
                <th className="text-left px-3 py-3 font-semibold">Último pago</th>
                <th className="text-center px-3 py-3 font-semibold" title="Comprobantes pendientes"><FileClock size={14} className="inline" /></th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(f => (
                <tr key={f.id} className={`hover:bg-gray-50/50 ${f.eliminada ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Logo f={f} />
                      <div className="min-w-0">
                        <Link href={`/admin/pos/${f.id}`} className="font-semibold text-gray-900 hover:text-indigo-600 truncate block max-w-[220px]">{f.nombre}</Link>
                        <a href={f.posUrl} target="_blank" rel="noreferrer" className="text-xs text-gray-400 hover:text-indigo-600 font-mono truncate block max-w-[220px]">{host(f.posUrl)}</a>
                        <Origen origen={f.origen} />
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 max-w-[200px]">
                    <p className="text-gray-800 truncate">{f.dueno ?? "—"}</p>
                    {f.whatsapp && <a href={`https://wa.me/${wa(f.whatsapp)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline"><MessageCircle size={12} /> {f.whatsapp}</a>}
                  </td>
                  <td className="px-3 py-3"><EstadoBadge f={f} /></td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{fecha(f.vence)}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                    {f.ultimoPago ? <>{fecha(f.ultimoPago.fecha)}<span className="block text-xs text-gray-400">{f.ultimoPago.moneda === "CLP" ? clp(f.ultimoPago.monto) : `${f.ultimoPago.moneda} ${f.ultimoPago.monto}`}</span></> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {f.pendientes > 0 ? <Link href={`/admin/pos/${f.id}#comprobantes`} className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">{f.pendientes}</Link> : <span className="text-gray-300">0</span>}
                  </td>
                  <td className="px-3 py-3"><Acciones f={f} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
