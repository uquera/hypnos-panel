"use client"

import { useEffect, useState } from "react"
import { Loader2, CheckCircle2, ArrowRight } from "lucide-react"

// Registro de la prueba gratis para almacenes: cuatro datos y tres toques. La dirección del
// sistema sale sola del nombre del local. Al enviar, se instala el sistema y esta misma
// pantalla avisa cuando está listo y lo abre sin pedir contraseña.

type Fase =
  | { tipo: "form" }
  | { tipo: "preparando"; id: string; token: string; nombre: string }
  | { tipo: "listo"; url: string; abrir: string; nombre: string }
  | { tipo: "error"; nombre: string }

const WA = "https://wa.me/56933688302"
const input = "h-12 w-full rounded-xl border border-stone-300 bg-[#ffffff] px-3.5 text-base text-stone-900 outline-none placeholder:text-stone-400 focus:border-[#f26522] focus:ring-4 focus:ring-orange-500/15"
const label = "mb-1 block text-sm font-semibold text-stone-700"

function Chips<T extends string>({ value, onChange, options, nombre }: { value: T; onChange: (v: T) => void; options: [T, string][]; nombre: string }) {
  return (
    <div role="radiogroup" aria-label={nombre} className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`h-10 rounded-xl border-2 px-3 text-sm font-semibold ${value === v ? "border-[#f26522] bg-orange-50 text-[#c2410c]" : "border-stone-200 bg-[#ffffff] text-stone-700"}`}>{l}</button>
      ))}
    </div>
  )
}

export default function AlmacenForm({ dias, precio }: { dias: number; precio: string }) {
  const [f, setF] = useState({ nombre: "", dueno: "", whatsapp: "", email: "", website: "" })
  const [atiende, setAtiende] = useState<"yo" | "empleados" | "ambos">("yo")
  const [cajas, setCajas] = useState<"1" | "2" | "3">("1")
  const [productos, setProductos] = useState<"pocos" | "medio" | "muchos">("medio")
  const [asistida, setAsistida] = useState(false)
  const [terminos, setTerminos] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [fase, setFase] = useState<Fase>({ tipo: "form" })
  const [segundos, setSegundos] = useState(0)

  // Consulta el avance de la instalación cada 3 segundos
  useEffect(() => {
    if (fase.tipo !== "preparando") return
    let vivo = true
    const inicio = Date.now()
    const t = setInterval(async () => {
      setSegundos(Math.round((Date.now() - inicio) / 1000))
      try {
        const r = await fetch(`/api/pos-registro/estado?id=${fase.id}&t=${encodeURIComponent(fase.token)}`, { cache: "no-store" })
        const d = await r.json()
        if (!vivo) return
        if (d.estado === "LISTO" && d.url) {
          setFase({ tipo: "listo", url: d.url, nombre: fase.nombre, abrir: `/api/pos-registro/abrir?id=${encodeURIComponent(fase.id)}&t=${encodeURIComponent(fase.token)}` })
        } else if (d.estado === "ERROR") setFase({ tipo: "error", nombre: fase.nombre })
      } catch { /* sin conexión un momento: se reintenta */ }
    }, 3000)
    return () => { vivo = false; clearInterval(t) }
  }, [fase])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.nombre.trim().length < 2) return setError("Escribe el nombre de tu almacén.")
    if (f.dueno.trim().length < 2) return setError("Escribe tu nombre.")
    if (f.whatsapp.replace(/\D/g, "").length < 8) return setError("Escribe tu WhatsApp con sus 9 dígitos.")
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return setError("Escribe un correo válido: ahí te llega el acceso.")
    if (!terminos) return setError("Acepta los términos para continuar.")
    setEnviando(true)
    setError("")
    try {
      const origen = new URLSearchParams(window.location.search).get("o") ?? ""
      const r = await fetch("/api/almacenes/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, atiende, cajas: Number(cajas), productos, asistida, terminos: true, origen }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || "No pudimos crear tu prueba. Intenta de nuevo.")
      setFase({ tipo: "preparando", id: d.id, token: d.token, nombre: f.nombre.trim() })
    } catch (err) {
      setError(err instanceof TypeError ? "No pudimos conectar. Revisa tu internet e intenta de nuevo." : err instanceof Error ? err.message : "No pudimos crear tu prueba.")
    } finally {
      setEnviando(false)
    }
  }

  const tarjeta = "rounded-2xl bg-[#ffffff] p-5 shadow-xl sm:p-6"

  if (fase.tipo === "preparando") {
    return (
      <div className={`${tarjeta} text-center`} role="status">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#f26522]" />
        <h3 className="mt-4 text-xl font-extrabold text-stone-900">Estamos preparando {fase.nombre}</h3>
        <p className="mt-2 text-stone-600">Creamos tu sistema y cargamos productos de ejemplo. Demora entre 1 y 3 minutos: no cierres esta página.</p>
        <p className="mt-4 text-sm text-stone-400">{segundos} segundos…</p>
      </div>
    )
  }
  if (fase.tipo === "listo") {
    return (
      <div className={`${tarjeta} text-center`}>
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h3 className="mt-3 text-2xl font-extrabold text-stone-900">¡{fase.nombre} está listo!</h3>
        <p className="mt-2 text-stone-600">Tu sistema quedó en <b className="break-all">{fase.url.replace(/^https?:\/\//, "")}</b>. Te enviamos el acceso a tu correo para que crees tu contraseña.</p>
        <a href={fase.abrir} className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#f26522] text-lg font-bold text-white">Entrar a mi sistema <ArrowRight size={20} /></a>
        <ol className="mt-5 space-y-1.5 text-left text-sm text-stone-600">
          <li><b>1.</b> Abre la caja (aviso amarillo de la pantalla).</li>
          <li><b>2.</b> Toca un producto de ejemplo o usa la cámara.</li>
          <li><b>3.</b> Toca Cobrar y mira el vuelto.</li>
        </ol>
        <a href={`${WA}?text=${encodeURIComponent(`Hola, acabo de crear la prueba de ${fase.nombre} y quiero ayuda para partir`)}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-emerald-700 underline">¿Te ayudamos a partir? Escríbenos por WhatsApp</a>
      </div>
    )
  }
  if (fase.tipo === "error") {
    return (
      <div className={`${tarjeta} text-center`}>
        <h3 className="text-xl font-extrabold text-stone-900">Tuvimos un problema al crear tu sistema</h3>
        <p className="mt-2 text-stone-600">Ya nos llegó el aviso y lo dejamos listo nosotros. Te escribimos por WhatsApp en cuanto esté.</p>
        <a href={`${WA}?text=${encodeURIComponent(`Hola, intenté crear la prueba de ${fase.nombre} y falló`)}`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-stone-900 font-semibold text-white">Escríbenos por WhatsApp</a>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className={tarjeta} noValidate>
      <div className="space-y-3">
        <div><label className={label} htmlFor="al-nombre">Nombre de tu almacén</label>
          <input id="al-nombre" className={input} value={f.nombre} maxLength={60} autoComplete="organization" placeholder="Minimarket Don Luis" onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={label} htmlFor="al-dueno">Tu nombre</label>
            <input id="al-dueno" className={input} value={f.dueno} maxLength={80} autoComplete="name" placeholder="Luis Pérez" onChange={e => setF({ ...f, dueno: e.target.value })} /></div>
          <div><label className={label} htmlFor="al-wa">WhatsApp</label>
            <input id="al-wa" className={input} value={f.whatsapp} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="9 1234 5678" onChange={e => setF({ ...f, whatsapp: e.target.value.replace(/[^\d+ ]/g, "") })} /></div>
        </div>
        <div><label className={label} htmlFor="al-email">Correo</label>
          <input id="al-email" className={input} value={f.email} maxLength={180} type="email" inputMode="email" autoComplete="email" placeholder="tucorreo@gmail.com" onChange={e => setF({ ...f, email: e.target.value })} /></div>
        {/* Honeypot: invisible para las personas */}
        <input tabIndex={-1} aria-hidden autoComplete="off" value={f.website} onChange={e => setF({ ...f, website: e.target.value })} className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />

        <div><span className={label}>¿Quién atiende la caja?</span>
          <Chips nombre="Quién atiende la caja" value={atiende} onChange={setAtiende} options={[["yo", "Yo"], ["empleados", "Mis empleados"], ["ambos", "Ambos"]]} /></div>
        <div><span className={label}>¿Cuántas cajas tienes?</span>
          <Chips nombre="Cantidad de cajas" value={cajas} onChange={setCajas} options={[["1", "1"], ["2", "2"], ["3", "3 o más"]]} /></div>
        <div><span className={label}>¿Cuántos productos manejas?</span>
          <Chips nombre="Cantidad de productos" value={productos} onChange={setProductos} options={[["pocos", "Menos de 500"], ["medio", "500 a 2.000"], ["muchos", "Más de 2.000"]]} /></div>

        <label className="flex items-start gap-2 rounded-xl bg-stone-100 px-3 py-2.5 text-sm text-stone-700">
          <input type="checkbox" checked={asistida} onChange={e => setAsistida(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#f26522]" />
          <span>Quiero que Hypnos cargue mis productos (puesta en marcha asistida, $100.000 una vez). Te contactamos para coordinar.</span>
        </label>
        <label className="flex items-start gap-2 text-xs text-stone-500">
          <input type="checkbox" checked={terminos} onChange={e => setTerminos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#f26522]" />
          <span>Acepto que Hypnos me contacte por WhatsApp y correo sobre mi prueba. Después de los {dias} días, el plan cuesta {precio} al mes por caja y solo se cobra si decido seguir.</span>
        </label>
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <button type="submit" disabled={enviando} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#f26522] text-lg font-bold text-white disabled:opacity-60">
        {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Crear mi prueba gratis
      </button>
      <p className="mt-2 text-center text-xs text-stone-400">Sin tarjeta · {dias} días gratis</p>
    </form>
  )
}
