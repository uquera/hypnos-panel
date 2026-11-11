"use client"

import { FileWarning, Loader2, ShieldCheck, ShieldAlert } from "lucide-react"

// Aviso y sello del validador de comprobantes, compartidos por Gastos e Ingresos.
// El servidor responde 422 cuando el adjunto no convence; aquí se le explica al
// operador qué falta y se le dan las dos salidas: subir otro o guardarlo igual.

export interface AvisoComprobante {
  veredicto: "debil" | "ilegible" | "recorte" | "ok"
  motivo:    string | null
  faltan:    string[]
  senales:   { clave: string; label: string; evidencia?: string }[]
  repetido:  { tipo?: "gasto" | "ingreso"; concepto: string; monto: number; moneda: string; fecha: string } | null
}

const QUE_DEBE_TENER = [
  "El monto pagado, tal como lo registras",
  "La fecha del cobro",
  "El nombre del proveedor o del servicio",
]

function monto(n: number, moneda: string) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: moneda, maximumFractionDigits: moneda === "CLP" ? 0 : 2 }).format(n)
}
function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}

export function ModalComprobante({ aviso, submitting, ambito = "gasto", onOtro, onIgual }: {
  aviso: AvisoComprobante
  submitting: boolean
  /** Cambia solo los textos: un gasto se justifica, un ingreso se respalda. */
  ambito?: "gasto" | "ingreso"
  onOtro: () => void
  onIgual: () => void
}) {
  const esIngreso = ambito === "ingreso"
  const yaUsado   = aviso.repetido
    ? `YA ${aviso.repetido.tipo === "ingreso" ? "RESPALDA OTRO INGRESO" : "JUSTIFICA OTRO GASTO"}`
    : null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => !submitting && onOtro()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh]">
        <div className="bg-amber-500 text-white px-5 py-4 text-center">
          <FileWarning size={22} className="mx-auto mb-1" />
          <p className="text-xs font-medium uppercase tracking-wide text-amber-100">El archivo adjunto</p>
          <p className="text-xl font-extrabold">{yaUsado ?? "NO PARECE UN COMPROBANTE"}</p>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-600">{aviso.motivo}</p>

          {aviso.repetido && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <p className="font-bold">Este archivo ya está usado</p>
              <p className="mt-0.5">
                {aviso.repetido.concepto} · {fecha(aviso.repetido.fecha)} · {monto(aviso.repetido.monto, aviso.repetido.moneda)}
              </p>
            </div>
          )}

          {!aviso.repetido && aviso.faltan.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">No encontramos en el documento</p>
              <ul className="mt-1 space-y-0.5">
                {aviso.faltan.map(f => <li key={f}>· {f}</li>)}
              </ul>
            </div>
          )}

          {!aviso.repetido && aviso.senales.length > 0 && (
            <p className="text-xs text-gray-400">
              Sí encontramos: {aviso.senales.map(s => s.label).join(", ")}.
            </p>
          )}

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-500">
            <p className="font-semibold text-gray-600">Un comprobante que sirve muestra</p>
            <ul className="mt-1 space-y-0.5">
              {QUE_DEBE_TENER.map(q => <li key={q}>· {q}</li>)}
            </ul>
            <p className="mt-1.5">
              Sirve el correo del {esIngreso ? "abono" : "cobro"}, la {esIngreso ? "transferencia" : "boleta"} en PDF o la
              pantalla completa del pago. Un recorte de una parte de la pantalla, no.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onOtro} disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
              Subir otro archivo
            </button>
            <button type="button" onClick={onIgual} disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 flex items-center justify-center gap-2">
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : "Guardarlo así"}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">
            Si lo guardas así, el {ambito} queda marcado como <b>comprobante sin verificar</b> y se ve en la lista.
          </p>
        </div>
      </div>
    </div>
  )
}

// Sello del comprobante en la lista: verde si pasó la revisión, ámbar si se
// guardó igual. Los movimientos cargados antes del validador no tienen sello.
export function SelloComprobante({ ok, nota, size = 12 }: { ok: boolean | null; nota: string | null; size?: number }) {
  if (ok === null) return null
  return (
    <span title={`${ok ? "Comprobante verificado" : "Comprobante sin verificar"}${nota ? ` · ${nota}` : ""}`} className="inline-flex">
      {ok
        ? <ShieldCheck size={size} className="text-emerald-500 shrink-0" />
        : <ShieldAlert size={size} className="text-amber-500 shrink-0" />}
    </span>
  )
}
