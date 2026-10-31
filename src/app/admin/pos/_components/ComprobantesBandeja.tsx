"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, ExternalLink, FileText, Loader2, X } from "lucide-react"
import { postJson } from "./accionPos"

export interface ComprobanteFila {
  id: string; cuentaId: string; restaurante: string; codigo: string
  monto: number; mime: string; comentario: string | null; subidoPor: string; fecha: string
  /** Meses que cubre el monto según los links de pago (anual = 12); por defecto 1. */
  mesesSugeridos?: number
  estado: string; motivo: string | null; revisadoPor: string | null
}

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)

function Fila({ c, mostrarRestaurante }: { c: ComprobanteFila; mostrarRestaurante: boolean }) {
  const router = useRouter()
  const [monto, setMonto] = useState(String(c.monto))
  const [meses, setMeses] = useState(String(c.mesesSugeridos ?? 1))
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [loading, setLoading] = useState<"" | "a" | "r">("")
  const pendiente = c.estado === "PENDIENTE"

  async function aprobar() {
    if (!confirm(`¿Aprobar ${clp(Number(monto))} de ${c.restaurante} por ${meses} mes(es)? Se extiende la licencia y se avisa al dueño.`)) return
    setLoading("a")
    const d = await postJson(`/api/pos-admin/comprobantes/${c.id}`, { accion: "aprobar", monto: Number(monto), meses: Number(meses) })
    setLoading("")
    if (d) {
      toast.success(`Pago aprobado: activo hasta ${new Date(String(d.hasta)).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`)
      router.refresh()
    }
  }

  async function rechazar() {
    if (motivo.trim().length < 3) { toast.error("Escribe el motivo."); return }
    setLoading("r")
    const d = await postJson(`/api/pos-admin/comprobantes/${c.id}`, { accion: "rechazar", motivo })
    setLoading("")
    if (d) { toast.success("Comprobante rechazado; se avisó al dueño."); router.refresh() }
  }

  return (
    <li className="p-4 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <a href={`/api/pos-comprobantes/${c.id}`} target="_blank" rel="noreferrer"
          className="w-16 h-16 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 hover:ring-2 hover:ring-indigo-200">
          {c.mime.startsWith("image/")
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/pos-comprobantes/${c.id}`} alt="Comprobante" className="w-full h-full object-cover" />
            : <FileText size={24} className="text-gray-400" />}
        </a>
        <div className="flex-1 min-w-[180px]">
          {mostrarRestaurante && (
            <Link href={`/admin/pos/${c.cuentaId}`} className="font-semibold text-gray-900 hover:text-indigo-600">{c.restaurante} <span className="font-mono text-xs text-gray-400">{c.codigo}</span></Link>
          )}
          <p className="text-sm text-gray-700">Declarado: <strong>{clp(c.monto)}</strong> · {c.fecha}</p>
          <p className="text-xs text-gray-400">{c.subidoPor}{c.comentario ? ` · “${c.comentario}”` : ""}</p>
          {!pendiente && (
            <p className={`text-xs mt-1 font-semibold ${c.estado === "APROBADO" ? "text-green-700" : "text-red-700"}`}>
              {c.estado === "APROBADO" ? "Aprobado" : `Rechazado: ${c.motivo ?? ""}`}{c.revisadoPor ? ` · ${c.revisadoPor}` : ""}
            </p>
          )}
          <a href={`/api/pos-comprobantes/${c.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-1">
            Ver archivo <ExternalLink size={11} />
          </a>
        </div>
        {pendiente && !rechazando && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-500">Monto
              <input value={monto} onChange={e => setMonto(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                className="block w-28 h-9 px-2.5 rounded-lg border border-gray-200 text-sm" />
            </label>
            <label className="text-xs text-gray-500">Meses
              <select value={meses} onChange={e => setMeses(e.target.value)} className="block h-9 px-2 rounded-lg border border-gray-200 text-sm bg-white">
                {[1, 2, 3, 6, 12].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <button type="button" onClick={aprobar} disabled={!!loading}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60">
              {loading === "a" ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aprobar
            </button>
            <button type="button" onClick={() => setRechazando(true)} disabled={!!loading}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50">
              <X size={13} /> Rechazar
            </button>
          </div>
        )}
      </div>
      {pendiente && rechazando && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={500}
            placeholder="Motivo (lo verá el dueño): monto no coincide, archivo ilegible…"
            className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm" />
          <div className="flex gap-2">
            <button type="button" onClick={rechazar} disabled={!!loading}
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60">
              {loading === "r" && <Loader2 size={13} className="animate-spin" />} Confirmar rechazo
            </button>
            <button type="button" onClick={() => setRechazando(false)} className="px-3 h-9 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}
    </li>
  )
}

export default function ComprobantesBandeja({ comprobantes, mostrarRestaurante = false }: { comprobantes: ComprobanteFila[]; mostrarRestaurante?: boolean }) {
  if (!comprobantes.length) return <p className="text-sm text-gray-400">Sin comprobantes.</p>
  return (
    <ul className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
      {comprobantes.map(c => <Fila key={c.id} c={c} mostrarRestaurante={mostrarRestaurante} />)}
    </ul>
  )
}
