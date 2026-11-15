"use client"

import { useState } from "react"
import { AlertTriangle, Check, Loader2 } from "lucide-react"
import { formatoRut, normalizarRut } from "@/lib/pos/contratar-calculo"

const NARANJA = "#f26522"
const WA = "https://wa.me/56933688302?text=" + encodeURIComponent("Hola, soy contador y quiero conocer el programa de partners de Hypnos POS")
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const CLIENTES = ["1 a 10", "11 a 30", "31 a 100", "Más de 100"]
const input = "w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/15 focus:border-orange-500 transition"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"

export default function ContadorForm({ origen }: { origen: string }) {
  const [f, setF] = useState({ nombre: "", oficina: "", rut: "", telefono: "", email: "", clientes: "", website: "" })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)
  const rutOk = f.rut.trim() ? normalizarRut(f.rut) : ""

  function validar(): string {
    if (f.nombre.trim().length < 2) return "Escribe tu nombre."
    if (f.oficina.trim().length < 2) return "Escribe el nombre de tu oficina contable (o tu nombre si trabajas solo)."
    if (rutOk === null) return "Revisa el RUT (o déjalo en blanco)."
    if (f.telefono.replace(/\D/g, "").length < 8) return "Escribe un teléfono válido."
    if (!EMAIL_RE.test(f.email.trim())) return "Escribe un correo válido."
    if (!f.clientes) return "Indica cuántos clientes pyme atiendes, aproximadamente."
    return ""
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const v = validar()
    setError(v)
    if (v) return
    setEnviando(true)
    try {
      const r = await fetch("/api/pos-registro/contador", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, rut: rutOk || "", tipo: "CONTADOR", origen }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? "No pudimos enviar tus datos. Intenta de nuevo."); return }
      setListo(true)
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <div className="bg-white rounded-3xl border border-orange-100 shadow-sm p-6 text-center space-y-3">
        <span className="mx-auto w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><Check size={28} /></span>
        <h2 className="text-xl font-bold text-gray-900">¡Gracias! Te llamamos pronto</h2>
        <p className="text-sm text-gray-600">Coordinaremos una llamada para contarte cómo funciona el programa y las condiciones para partners.</p>
        <a href={WA} target="_blank" rel="noreferrer" className="inline-block text-sm underline text-gray-500">¿Prefieres escribirnos por WhatsApp?</a>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} noValidate className="bg-white rounded-3xl border border-orange-100 shadow-sm p-5 sm:p-6 space-y-4 lg:sticky lg:top-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Quiero ser partner</h2>
        <p className="text-sm text-gray-500 mt-1">Las condiciones para partners te las contamos en una llamada.</p>
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>Sitio web <input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></label>
      </div>
      <div>
        <label className={label} htmlFor="c-nombre">Tu nombre</label>
        <input id="c-nombre" className={input} value={f.nombre} autoComplete="name" onChange={e => setF({ ...f, nombre: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor="c-oficina">Oficina contable</label>
        <input id="c-oficina" className={input} value={f.oficina} autoComplete="organization" onChange={e => setF({ ...f, oficina: e.target.value })} placeholder="Contadores Asociados Ltda." />
      </div>
      <div>
        <label className={label} htmlFor="c-rut">RUT <span className="font-normal text-gray-400">(opcional)</span></label>
        <input id="c-rut" className={input} value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })}
          onBlur={() => rutOk && setF(x => ({ ...x, rut: formatoRut(rutOk) }))} placeholder="76.123.456-7" />
        {f.rut.trim().length >= 8 && rutOk === null && <p className="mt-1 text-xs text-red-600">Revisa el dígito verificador</p>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-4">
        <div>
          <label className={label} htmlFor="c-tel">Teléfono / WhatsApp</label>
          <input id="c-tel" className={input} value={f.telefono} inputMode="tel" autoComplete="tel" onChange={e => setF({ ...f, telefono: e.target.value })} placeholder="+56 9 1234 5678" />
        </div>
        <div>
          <label className={label} htmlFor="c-email">Correo</label>
          <input id="c-email" className={input} type="email" value={f.email} autoComplete="email" onChange={e => setF({ ...f, email: e.target.value })} />
        </div>
      </div>
      <div>
        <span className={label}>¿Cuántos clientes pyme atiendes, aproximadamente?</span>
        <div className="grid grid-cols-2 gap-2">
          {CLIENTES.map(c => (
            <button key={c} type="button" onClick={() => setF({ ...f, clientes: c })}
              className={`h-10 rounded-xl border-2 text-sm font-semibold transition ${f.clientes === c ? "border-orange-500 bg-orange-50/60 text-gray-900" : "border-gray-200 text-gray-600"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </p>
      )}
      <button type="submit" disabled={enviando}
        className="w-full py-3.5 rounded-xl text-white font-bold text-[15px] shadow-lg shadow-orange-600/20 transition hover:brightness-105 disabled:opacity-60 inline-flex items-center justify-center gap-2"
        style={{ background: NARANJA }}>
        {enviando ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : "Quiero que me llamen"}
      </button>
    </form>
  )
}
