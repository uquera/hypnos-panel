"use client"

import { useEffect, useRef, useState } from "react"
import { CheckCircle2, ChefHat, Loader2, AlertTriangle, ExternalLink, Receipt, LayoutGrid, Wallet } from "lucide-react"

// Formulario público de registro de Hypnos POS (mobile-first) y pantalla de espera
// mientras se instala el sistema del restaurante.

const NARANJA = "#f26522"

type Disp = { estado: "vacio" | "revisando" | "ok" | "error"; mensaje?: string }
type Fase =
  | { tipo: "form" }
  | { tipo: "preparando"; id: string; token: string; nombre: string }
  | { tipo: "listo"; url: string; nombre: string }
  | { tipo: "error"; nombre: string }
  | { tipo: "recibido" }

function sugerir(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "y")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 30).replace(/-+$/, "")
}

const input = "w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/15 focus:border-orange-500 transition"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"

export default function RegistroForm({ precio, diasPrueba }: { precio: string; diasPrueba: number }) {
  const [form, setForm] = useState({ nombre: "", dueno: "", email: "", whatsapp: "", codigo: "", website: "" })
  const [codigoEditado, setCodigoEditado] = useState(false)
  const [terminos, setTerminos] = useState(false)
  const [disp, setDisp] = useState<Disp>({ estado: "vacio" })
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [fase, setFase] = useState<Fase>({ tipo: "form" })
  const consulta = useRef(0)

  // Sugerencia automática del subdominio mientras no lo edite a mano
  useEffect(() => {
    if (!codigoEditado) setForm(f => ({ ...f, codigo: sugerir(f.nombre) }))
  }, [form.nombre, codigoEditado])

  // Verificación de disponibilidad en vivo (con espera de 450 ms)
  useEffect(() => {
    const codigo = form.codigo
    if (!codigo) { setDisp({ estado: "vacio" }); return }
    setDisp({ estado: "revisando" })
    const n = ++consulta.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos-registro/disponible?codigo=${encodeURIComponent(codigo)}`)
        const d = await r.json()
        if (n !== consulta.current) return
        if (!r.ok) setDisp({ estado: "error", mensaje: d.error ?? "No pudimos verificar." })
        else setDisp(d.disponible ? { estado: "ok" } : { estado: "error", mensaje: d.error ?? "No disponible." })
      } catch {
        if (n === consulta.current) setDisp({ estado: "error", mensaje: "Sin conexión." })
      }
    }, 450)
    return () => clearTimeout(t)
  }, [form.codigo])

  // Consulta del estado de la instalación
  useEffect(() => {
    if (fase.tipo !== "preparando") return
    let vivo = true
    const tick = async () => {
      try {
        const r = await fetch(`/api/pos-registro/estado?id=${fase.id}&t=${encodeURIComponent(fase.token)}`, { cache: "no-store" })
        const d = await r.json()
        if (!vivo) return
        if (d.estado === "LISTO" && d.url) setFase({ tipo: "listo", url: d.url, nombre: fase.nombre })
        else if (d.estado === "ERROR") setFase({ tipo: "error", nombre: fase.nombre })
      } catch { /* reintenta en el próximo ciclo */ }
    }
    tick()
    const iv = setInterval(tick, 4000)
    return () => { vivo = false; clearInterval(iv) }
  }, [fase])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!terminos) { setError("Acepta los términos para continuar."); return }
    if (disp.estado !== "ok") { setError(disp.mensaje ?? "Revisa el subdominio."); return }
    setEnviando(true)
    try {
      const r = await fetch("/api/pos-registro", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, terminos: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? "No pudimos crear tu cuenta. Intenta de nuevo."); return }
      if (!d.id) { setFase({ tipo: "recibido" }); return }
      setFase({ tipo: "preparando", id: d.id, token: d.token, nombre: form.nombre })
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fff7f2]">
      {/* Encabezado de marca */}
      <header className="bg-gray-950 text-white">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-24 sm:pb-28">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: NARANJA }}>
              <ChefHat size={20} />
            </div>
            <span className="font-bold tracking-tight text-lg">Hypnos <span style={{ color: NARANJA }}>POS</span></span>
          </div>
          <h1 className="mt-8 text-3xl sm:text-4xl font-extrabold leading-tight max-w-xl">
            El sistema de tu restaurante, listo en minutos.
          </h1>
          <p className="mt-3 text-gray-300 max-w-lg text-[15px]">
            Mesas, comandas a cocina, caja y pagos con tu máquina. Pruébalo <strong className="text-white">{diasPrueba} días gratis</strong>, sin tarjeta.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-gray-300">
            {[{ i: LayoutGrid, t: "Mesas y comandas" }, { i: Receipt, t: "Caja y boletas" }, { i: Wallet, t: `${precio}/mes después` }].map(x => (
              <span key={x.t} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-white/10"><x.i size={14} /> {x.t}</span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 -mt-16 sm:-mt-20 pb-12">
        <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-xl shadow-orange-900/5 border border-orange-100 p-5 sm:p-8">
          {fase.tipo === "form" && (
            <form onSubmit={enviar} className="space-y-4" noValidate>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Crea tu cuenta gratis</h2>
                <p className="text-sm text-gray-500 mt-1">Te tomará menos de un minuto.</p>
              </div>

              {/* Honeypot: invisible para personas */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>Sitio web <input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></label>
              </div>

              <div>
                <label htmlFor="nombre" className={label}>Nombre del restaurante</label>
                <input id="nombre" required maxLength={60} className={input} placeholder="Ej: Sabores de Doña Rosa"
                  value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              </div>

              <div>
                <label htmlFor="codigo" className={label}>Dirección de tu sistema</label>
                <div className={`flex items-stretch rounded-xl border bg-white overflow-hidden focus-within:ring-4 transition ${disp.estado === "error" ? "border-red-300 focus-within:ring-red-500/10" : "border-gray-200 focus-within:ring-orange-500/15 focus-within:border-orange-500"}`}>
                  <input id="codigo" maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    className="flex-1 min-w-0 h-12 pl-4 pr-1 text-[15px] font-mono text-gray-900 focus:outline-none"
                    placeholder="mirestaurante" value={form.codigo}
                    onChange={e => { setCodigoEditado(true); setForm({ ...form, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }) }} />
                  <span className="flex items-center pr-4 text-sm text-gray-400 font-mono shrink-0">.hypnosapps.com</span>
                </div>
                <p className="mt-1.5 text-xs min-h-[1rem]">
                  {disp.estado === "revisando" && <span className="text-gray-400 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Verificando…</span>}
                  {disp.estado === "ok" && <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> <span className="font-mono">{form.codigo}.hypnosapps.com</span> está disponible</span>}
                  {disp.estado === "error" && <span className="text-red-600">{disp.mensaje}</span>}
                </p>
              </div>

              <div>
                <label htmlFor="dueno" className={label}>Tu nombre</label>
                <input id="dueno" required maxLength={80} autoComplete="name" className={input} placeholder="Nombre y apellido"
                  value={form.dueno} onChange={e => setForm({ ...form, dueno: e.target.value })} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className={label}>Correo</label>
                  <input id="email" type="email" required autoComplete="email" inputMode="email" className={input} placeholder="tu@correo.cl"
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="whatsapp" className={label}>WhatsApp</label>
                  <input id="whatsapp" type="tel" required autoComplete="tel" inputMode="tel" className={input} placeholder="+56 9 1234 5678"
                    value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
                </div>
              </div>

              <label className="flex gap-3 items-start p-3.5 rounded-xl bg-orange-50/60 border border-orange-100 cursor-pointer">
                <input type="checkbox" checked={terminos} onChange={e => setTerminos(e.target.checked)}
                  className="mt-0.5 w-5 h-5 rounded accent-orange-600 shrink-0" />
                <span className="text-[13px] text-gray-600 leading-relaxed">
                  Acepto los términos: los primeros <strong>{diasPrueba} días son gratis</strong>; después el plan cuesta <strong>{precio} al mes</strong>,
                  pagado por transferencia. Si no pago, el sistema se suspende. Puedo cancelar cuando quiera.
                </span>
              </label>

              {error && (
                <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
                </p>
              )}

              <button type="submit" disabled={enviando}
                className="w-full h-13 py-3.5 rounded-xl text-white font-bold text-[15px] shadow-lg shadow-orange-600/20 transition hover:brightness-105 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ background: NARANJA }}>
                {enviando ? <><Loader2 size={18} className="animate-spin" /> Creando tu cuenta…</> : "Empezar prueba gratis"}
              </button>
              <p className="text-center text-xs text-gray-400">¿Dudas? Escríbenos al WhatsApp <a className="underline" href="https://wa.me/56933688302">+56 9 3368 8302</a></p>
            </form>
          )}

          {fase.tipo === "preparando" && (
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white" style={{ background: NARANJA }}>
                <Loader2 size={30} className="animate-spin" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-gray-900">Estamos preparando tu sistema</h2>
              <p className="mt-2 text-sm text-gray-500">Instalando <strong>{fase.nombre}</strong>. Suele tardar 1 a 3 minutos; no cierres esta página.</p>
              <div className="mt-6 h-2 rounded-full bg-orange-100 overflow-hidden">
                <div className="h-full w-1/3 rounded-full animate-[progreso_1.6s_ease-in-out_infinite]" style={{ background: NARANJA }} />
              </div>
              <p className="mt-4 text-xs text-gray-400">También te avisaremos por correo cuando esté listo.</p>
              <style>{`@keyframes progreso{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
            </div>
          )}

          {fase.tipo === "listo" && (
            <div className="text-center py-6">
              <CheckCircle2 size={56} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-xl font-bold text-gray-900">¡{fase.nombre} está listo!</h2>
              <p className="mt-2 text-sm text-gray-500">Tu sistema ya funciona en:</p>
              <a href={fase.url} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-sm font-semibold break-all" style={{ color: NARANJA }}>
                {fase.url.replace(/^https?:\/\//, "")}
              </a>
              <p className="mt-4 text-sm text-gray-600">Revisa tu correo: te enviamos el enlace para <strong>crear tu contraseña</strong>.</p>
              <a href={fase.url} target="_blank" rel="noreferrer"
                className="mt-6 w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style={{ background: NARANJA }}>
                Abrir mi sistema <ExternalLink size={16} />
              </a>
            </div>
          )}

          {fase.tipo === "error" && (
            <div className="text-center py-6">
              <AlertTriangle size={48} className="mx-auto text-amber-500" />
              <h2 className="mt-4 text-xl font-bold text-gray-900">Tuvimos un problema instalando tu sistema</h2>
              <p className="mt-2 text-sm text-gray-500">Tu cuenta de <strong>{fase.nombre}</strong> quedó registrada y nuestro equipo ya fue avisado. Te escribiremos apenas esté listo.</p>
              <a href="https://wa.me/56933688302" className="mt-6 w-full h-12 rounded-xl bg-gray-900 text-white font-semibold inline-flex items-center justify-center">Escríbenos por WhatsApp</a>
            </div>
          )}

          {fase.tipo === "recibido" && (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="mx-auto text-green-500" />
              <h2 className="mt-4 text-xl font-bold text-gray-900">Recibimos tu solicitud</h2>
              <p className="mt-2 text-sm text-gray-500">Te escribiremos pronto.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
