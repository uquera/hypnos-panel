"use client"

import { useState } from "react"
import { AlertTriangle, ArrowLeft, Check, ChefHat, CreditCard, Loader2, Smartphone } from "lucide-react"
import { clp, formatoRut, normalizarRut } from "@/lib/pos/contratar-calculo"

// Página pública "Consigue tu máquina" (/pos/maquina). Solo marcas integradas con Hypnos POS.

const NARANJA = "#f26522"
const WA = "https://wa.me/56933688302?text=" + encodeURIComponent("Hola, quiero una máquina de pago conectada a Hypnos POS")
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const input = "w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/15 focus:border-orange-500 transition"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"

type Marca = "MERCADOPAGO" | "TUU"

export default function MaquinaForm({ precioPoint, pointConStock, inicial }: {
  precioPoint: number; pointConStock: boolean
  inicial: { marca: Marca | null; origen: string }
}) {
  const [marca, setMarca] = useState<Marca | null>(inicial.marca)
  const [f, setF] = useState({ rut: "", razonSocial: "", nombre: "", telefono: "", email: "", comuna: "", website: "" })
  const [autoriza, setAutoriza] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [listo, setListo] = useState(false)
  const rutOk = normalizarRut(f.rut)
  const nombreMarca = marca === "TUU" ? "TUU" : "Mercado Pago"

  function validar(): string {
    if (!marca) return "Elige la máquina que quieres."
    if (!rutOk) return "Revisa el RUT de la empresa."
    if (f.razonSocial.trim().length < 2) return "Escribe la razón social (o tu nombre si eres persona natural)."
    if (f.nombre.trim().length < 2) return "Escribe tu nombre."
    if (f.telefono.replace(/\D/g, "").length < 8) return "Escribe un teléfono válido."
    if (!EMAIL_RE.test(f.email.trim())) return "Escribe un correo válido."
    if (f.comuna.trim().length < 2) return "Escribe la comuna."
    if (!autoriza) return `Marca la casilla para autorizarnos a compartir tus datos con ${nombreMarca}.`
    return ""
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const v = validar()
    setError(v)
    if (v) return
    setEnviando(true)
    try {
      const r = await fetch("/api/pos-registro/maquina", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, rut: rutOk, marca, autoriza, origen: inicial.origen }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? "No pudimos enviar tu solicitud. Intenta de nuevo."); return }
      setListo(true)
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  const opciones: { v: Marca; t: string; precio: React.ReactNode; d: string; items: string[]; I: typeof CreditCard; c: string }[] = [
    {
      v: "MERCADOPAGO", t: "Mercado Pago Point Smart 2", I: CreditCard, c: "#009ee3",
      precio: <>{clp(precioPoint)} <span className="text-sm font-medium text-gray-500">IVA incluido</span></>,
      d: "Te la vende Hypnos y te llega lista para conectar a tu caja.",
      items: ["El monto pasa solo de la caja a la máquina", "Crédito, débito y pagos con el celular", "La comisión de Mercado Pago es aparte", ...(pointConStock ? [] : ["Sin stock por ahora: te avisamos apenas llegue"])],
    },
    {
      v: "TUU", t: "Máquina TUU", I: Smartphone, c: "#111827",
      precio: <span className="text-base">Según el plan de TUU</span>,
      d: "Gestionamos tu solicitud con TUU y la conectamos a tu caja.",
      items: ["El monto pasa solo de la caja a la máquina", "TUU te contacta con sus planes y condiciones", "La comisión de TUU es aparte"],
    },
  ]

  return (
    <div className="min-h-screen bg-[#fff7f2]">
      <header className="bg-gray-950 text-white">
        <div className="max-w-4xl mx-auto px-5 pt-6 pb-24">
          <a href="/pos/contratar" className="flex items-center gap-2.5 w-fit">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: NARANJA }}><ChefHat size={20} /></span>
            <span className="font-bold tracking-tight text-lg">Hypnos <span style={{ color: NARANJA }}>POS</span></span>
          </a>
          <h1 className="mt-7 text-3xl sm:text-4xl font-extrabold leading-tight max-w-2xl">Consigue tu máquina de pago</h1>
          <p className="mt-3 text-gray-300 max-w-xl text-[15px]">
            Elige tu máquina y nosotros hacemos el trámite. Queda conectada a tu caja de Hypnos POS: el monto pasa solo, sin digitarlo.
          </p>
          <p className="mt-2 text-sm text-gray-400">¿Ya tienes una TUU o una Mercado Pago? No la cambies: funciona con la tuya.</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 -mt-16 pb-16">
        <div className="bg-white rounded-3xl shadow-xl shadow-orange-900/5 border border-orange-100 p-5 sm:p-8">
          {listo ? (
            <div className="text-center py-8 space-y-3">
              <span className="mx-auto w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center"><Check size={28} /></span>
              <h2 className="text-2xl font-bold text-gray-900">¡Recibimos tu solicitud!</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                {marca === "TUU"
                  ? "Te escribiremos para contarte cómo sigue y enviaremos tu solicitud a TUU."
                  : "Te escribiremos para coordinar el pago y el despacho de tu Point Smart 2."}
              </p>
              <div className="pt-3 flex flex-wrap justify-center gap-3">
                <a href="/pos/contratar" className="px-5 py-3 rounded-xl text-white font-bold" style={{ background: NARANJA }}>Contratar Hypnos POS</a>
                <a href={WA} target="_blank" rel="noreferrer" className="px-5 py-3 rounded-xl border border-gray-200 font-semibold text-gray-700">Escríbenos por WhatsApp</a>
              </div>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-6" noValidate>
              <section>
                <h2 className="text-xl font-bold text-gray-900">1. Elige tu máquina</h2>
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                  {opciones.map(o => (
                    <button key={o.v} type="button" onClick={() => { setMarca(o.v); setError("") }}
                      className={`text-left rounded-2xl border-2 p-4 transition ${marca === o.v ? "border-orange-500 bg-orange-50/60" : "border-gray-200 hover:border-orange-200"}`}>
                      <span className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: o.c }}><o.I size={20} /></span>
                        <span className="font-bold text-gray-900">{o.t}</span>
                      </span>
                      <span className="block mt-3 text-2xl font-extrabold text-gray-900">{o.precio}</span>
                      <span className="block mt-1 text-[13px] text-gray-600">{o.d}</span>
                      <span className="block mt-3 space-y-1 text-[13px] text-gray-600">
                        {o.items.map(i => <span key={i} className="flex gap-1.5"><Check size={15} className="text-green-600 shrink-0 mt-0.5" />{i}</span>)}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400">Getnet y otras, próximamente.</p>
              </section>

              {/* Honeypot */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>Sitio web <input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} /></label>
              </div>

              <section className="space-y-4">
                <h2 className="text-xl font-bold text-gray-900">2. Tus datos</h2>
                <div className="grid sm:grid-cols-2 gap-x-3 gap-y-4">
                  <div>
                    <label className={label} htmlFor="m-rut">RUT de la empresa</label>
                    <input id="m-rut" className={input} value={f.rut} onChange={e => setF({ ...f, rut: e.target.value })}
                      onBlur={() => rutOk && setF(x => ({ ...x, rut: formatoRut(rutOk) }))} placeholder="76.123.456-7" />
                    {f.rut.length >= 8 && (rutOk ? <p className="mt-1 text-xs text-green-600 font-medium">✓ RUT válido</p> : <p className="mt-1 text-xs text-red-600">Revisa el dígito verificador</p>)}
                  </div>
                  <div>
                    <label className={label} htmlFor="m-rs">Razón social</label>
                    <input id="m-rs" className={input} value={f.razonSocial} onChange={e => setF({ ...f, razonSocial: e.target.value })} placeholder="Comercial El Trébol SpA" />
                  </div>
                  <div>
                    <label className={label} htmlFor="m-nombre">Tu nombre</label>
                    <input id="m-nombre" className={input} value={f.nombre} autoComplete="name" onChange={e => setF({ ...f, nombre: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="m-tel">Teléfono / WhatsApp</label>
                    <input id="m-tel" className={input} value={f.telefono} inputMode="tel" autoComplete="tel" onChange={e => setF({ ...f, telefono: e.target.value })} placeholder="+56 9 1234 5678" />
                  </div>
                  <div>
                    <label className={label} htmlFor="m-email">Correo</label>
                    <input id="m-email" className={input} type="email" value={f.email} autoComplete="email" onChange={e => setF({ ...f, email: e.target.value })} />
                  </div>
                  <div>
                    <label className={label} htmlFor="m-comuna">Comuna</label>
                    <input id="m-comuna" className={input} value={f.comuna} onChange={e => setF({ ...f, comuna: e.target.value })} placeholder="Antofagasta" />
                  </div>
                </div>
                <label className="flex gap-3 items-start p-3.5 rounded-xl bg-orange-50/60 border border-orange-100 cursor-pointer">
                  <input type="checkbox" checked={autoriza} onChange={e => setAutoriza(e.target.checked)} className="mt-0.5 w-5 h-5 rounded accent-orange-600 shrink-0" />
                  <span className="text-[13px] text-gray-600 leading-relaxed">
                    Autorizo a Hypnos SpA a compartir estos datos con <strong>{marca ? nombreMarca : "la marca que elegí"}</strong> para gestionar mi máquina de pago.
                  </span>
                </label>
              </section>

              {error && (
                <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
                </p>
              )}
              <button type="submit" disabled={enviando}
                className="w-full py-3.5 rounded-xl text-white font-bold text-[15px] shadow-lg shadow-orange-600/20 transition hover:brightness-105 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ background: NARANJA }}>
                {enviando ? <><Loader2 size={18} className="animate-spin" /> Enviando…</> : "Pedir mi máquina"}
              </button>
              <p className="text-center text-xs text-gray-400">
                No cobramos nada todavía: te contactamos para confirmar. ¿Dudas? <a href={WA} target="_blank" rel="noreferrer" className="underline">Escríbenos por WhatsApp</a>
              </p>
            </form>
          )}
        </div>
        <p className="mt-6 text-center text-sm">
          <a href="/pos/contratar" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"><ArrowLeft size={14} /> Volver a contratar Hypnos POS</a>
        </p>
      </main>
    </div>
  )
}
