"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Copy, CreditCard, ExternalLink, FileUp, Loader2, ShieldCheck, Clock, XCircle, CheckCircle2 } from "lucide-react"

interface Props {
  estado: { titulo: string; detalle: string; tono: "verde" | "ambar" | "rojo" | "gris" }
  monto: number
  montoTxt: string
  datos: string | null
  /** Link de cobro TUU del monto de este restaurante (tarjeta o Webpay); null = solo transferencia. */
  linkTarjeta: string | null
  contacto: string
  sinPlan: boolean
  pagos: { id: string; fecha: string; monto: string; periodo: string }[]
  comprobantes: { id: string; fecha: string; monto: string; estado: string; motivo: string | null }[]
}

const TONOS = {
  verde: "bg-green-50 border-green-200 text-green-800",
  ambar: "bg-amber-50 border-amber-200 text-amber-800",
  rojo:  "bg-red-50 border-red-200 text-red-800",
  gris:  "bg-gray-50 border-gray-200 text-gray-700",
}
const MAX = 8 * 1024 * 1024
const card = "bg-white rounded-2xl border border-gray-100 shadow-sm p-5"

export default function PagoCliente({ estado, monto, montoTxt, datos, linkTarjeta, contacto, sinPlan, pagos, comprobantes }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [copiado, setCopiado] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [montoDecl, setMontoDecl] = useState(String(monto))
  const [comentario, setComentario] = useState("")
  const [enviando, setEnviando] = useState(false)
  const pendiente = comprobantes.some(c => c.estado === "PENDIENTE")

  async function copiar() {
    const texto = `${datos ?? ""}\nMonto: ${montoTxt}`.trim()
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Navegadores sin portapapeles (http, permisos): copia con un textarea temporal
      const ta = document.createElement("textarea")
      ta.value = texto
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      ta.remove()
    }
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  function elegir(f: File | null) {
    if (!f) return setArchivo(null)
    if (f.size > MAX) { toast.error("El archivo pesa más de 8 MB."); return }
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { toast.error("Sube una imagen (JPG, PNG, WebP) o un PDF."); return }
    setArchivo(f)
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!archivo) { toast.error("Adjunta el comprobante."); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.set("archivo", archivo)
      fd.set("monto", montoDecl)
      fd.set("comentario", comentario)
      const r = await fetch("/api/pos-portal/comprobantes", { method: "POST", body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error ?? "No pudimos subir el comprobante."); return }
      toast.success("¡Comprobante enviado! Te avisaremos por correo cuando lo revisemos.")
      setArchivo(null); setComentario("")
      if (fileRef.current) fileRef.current.value = ""
      router.refresh()
    } catch {
      toast.error("Error de red. Intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className={`rounded-2xl border p-5 ${TONOS[estado.tono]}`}>
        <p className="text-lg font-bold">{estado.titulo}</p>
        {estado.detalle && <p className="text-sm mt-1 opacity-90">{estado.detalle}</p>}
        {pendiente && <p className="text-sm mt-2 inline-flex items-center gap-1.5 font-medium"><Clock size={14} /> Tienes un comprobante en revisión.</p>}
      </div>

      {sinPlan ? (
        <div className={card}><p className="text-sm text-gray-600">Tu cuenta aún no tiene un plan asociado. Escríbenos a {contacto}.</p></div>
      ) : (
        <>
          <div className={card}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto mensual</p>
                <p className="text-2xl font-extrabold text-gray-900 mt-0.5">{montoTxt}</p>
              </div>
              {datos && (
                <button type="button" onClick={copiar}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 shrink-0">
                  {copiado ? <><Check size={14} className="text-green-600" /> Copiado</> : <><Copy size={14} /> Copiar datos</>}
                </button>
              )}
            </div>
            {linkTarjeta && (
              <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <p className="text-sm font-semibold text-gray-900">Paga con tarjeta o Webpay</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  Pago seguro con TUU. En el formulario escribe el <b>nombre de tu local</b> y, al terminar, sube aquí abajo el comprobante que te llega por correo (o una captura).
                </p>
                <a href={linkTarjeta} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
                  <CreditCard size={16} /> Pagar {montoTxt} con tarjeta <ExternalLink size={14} className="opacity-70" />
                </a>
              </div>
            )}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5">{linkTarjeta ? "O transfiere a esta cuenta" : "Datos para transferir"}</p>
            {datos
              ? <p className="mt-1.5 text-sm text-gray-800 whitespace-pre-line leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-4">{datos}</p>
              : <p className="mt-1.5 text-sm text-gray-600">Solicita los datos de transferencia a <a className="underline" href={`mailto:${contacto}`}>{contacto}</a>.</p>}
          </div>

          <form onSubmit={enviar} className={`${card} space-y-4`}>
            <div>
              <h2 className="text-base font-bold text-gray-900">Subir comprobante</h2>
              <p className="text-sm text-gray-500 mt-0.5">Foto o PDF de la transferencia{linkTarjeta ? " o del pago con tarjeta" : ""} (máx. 8 MB).</p>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-5 text-center hover:border-gray-400 transition-colors">
              <FileUp size={22} className="mx-auto text-gray-400" />
              <p className="text-sm font-medium text-gray-700 mt-1.5 break-all">{archivo ? archivo.name : "Elegir archivo"}</p>
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
              onChange={e => elegir(e.target.files?.[0] ?? null)} />
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="monto" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monto transferido (CLP)</label>
                <input id="monto" inputMode="numeric" value={montoDecl} onChange={e => setMontoDecl(e.target.value.replace(/[^\d]/g, ""))}
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="comentario" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Comentario (opcional)</label>
                <input id="comentario" maxLength={500} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej: pago de noviembre"
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900" />
              </div>
            </div>
            <button type="submit" disabled={enviando || !archivo}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50">
              {enviando ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : "Enviar comprobante"}
            </button>
            <p className="text-xs text-gray-400 inline-flex items-center gap-1"><ShieldCheck size={12} /> Solo el equipo de Hypnos puede ver tu comprobante.</p>
          </form>
        </>
      )}

      {(comprobantes.length > 0 || pagos.length > 0) && (
        <div className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">Historial</h2>
          {comprobantes.length > 0 && (
            <ul className="divide-y divide-gray-50">
              {comprobantes.map(c => (
                <li key={c.id} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <a href={`/api/pos-comprobantes/${c.id}`} target="_blank" rel="noreferrer" className="font-medium text-gray-800 hover:underline">Comprobante {c.monto}</a>
                    <p className="text-xs text-gray-400">{c.fecha}{c.motivo ? ` · ${c.motivo}` : ""}</p>
                  </div>
                  {c.estado === "PENDIENTE" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full shrink-0"><Clock size={12} /> En revisión</span>}
                  {c.estado === "APROBADO" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full shrink-0"><CheckCircle2 size={12} /> Aprobado</span>}
                  {c.estado === "RECHAZADO" && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-full shrink-0"><XCircle size={12} /> Rechazado</span>}
                </li>
              ))}
            </ul>
          )}
          {pagos.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-1">Pagos registrados</p>
              <ul className="divide-y divide-gray-50">
                {pagos.map(p => (
                  <li key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div><p className="font-medium text-gray-800">{p.monto}</p><p className="text-xs text-gray-400">{p.periodo}</p></div>
                    <span className="text-xs text-gray-500">{p.fecha}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
