"use client"

import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2, ChefHat, Loader2, AlertTriangle, ExternalLink, Receipt, LayoutGrid, Wallet,
  ImagePlus, Link2, FileSpreadsheet, ArrowLeft, ArrowRight, X, Store, UtensilsCrossed, PartyPopper,
} from "lucide-react"

// Registro público de Hypnos POS (mobile-first) en 3 pasos — 1) tu local, 2) tu menú y logo, 3) listo —
// y pantalla de espera mientras se instala el sistema del restaurante.

const NARANJA = "#f26522"
const LOGO_MAX = 5 * 1024 * 1024
const CLIENTES_MAX = 10 * 1024 * 1024

type Disp = { estado: "vacio" | "revisando" | "ok" | "error"; mensaje?: string }
type Resultado = { menu?: { ok: boolean; productos?: number }; clientes?: { ok: boolean; importados?: number } } | null
type Fase =
  | { tipo: "form" }
  | { tipo: "preparando"; id: string; token: string; nombre: string }
  | { tipo: "listo"; url: string; abrir: string; nombre: string; conMenu: boolean; resultado: Resultado }
  | { tipo: "error"; nombre: string }
  | { tipo: "recibido" }

// En Android, un archivo elegido desde Google Fotos, Drive o la galería puede dejar de ser
// legible antes del envío (Chrome pierde el permiso): el fetch falla sin llegar al servidor.
// Por eso se copia a memoria apenas se elige.
async function enMemoria(f: File): Promise<File | null> {
  try {
    return new File([await f.arrayBuffer()], f.name || "archivo", { type: f.type })
  } catch {
    return null
  }
}

/** Copia el logo a memoria y, si es grande, lo reduce a 800 px en PNG (se ve igual y sube rápido). */
async function logoEnMemoria(f: File): Promise<File | null> {
  const copia = await enMemoria(f)
  if (!copia || copia.size <= 600 * 1024) return copia
  try {
    const img = await createImageBitmap(copia)
    const escala = Math.min(1, 800 / Math.max(img.width, img.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * escala)
    canvas.height = Math.round(img.height * escala)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    img.close()
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"))
    return blob && blob.size < copia.size ? new File([blob], "logo.png", { type: "image/png" }) : copia
  } catch {
    return copia
  }
}

function sugerir(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "y")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 30).replace(/-+$/, "")
}

const input = "w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/15 focus:border-orange-500 transition"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const PASOS = [
  { n: 1, titulo: "Tu local", icono: Store },
  { n: 2, titulo: "Menú y logo", icono: UtensilsCrossed },
  { n: 3, titulo: "Listo", icono: PartyPopper },
]

export default function RegistroForm({ precio, diasPrueba }: { precio: string; diasPrueba: number }) {
  const [form, setForm] = useState({
    nombre: "", dueno: "", email: "", whatsapp: "", codigo: "", website: "",
    direccion: "", horario: "", mesas: "10", menuUrl: "",
  })
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [clientes, setClientes] = useState<File | null>(null)
  const [paso, setPaso] = useState(1)
  const [codigoEditado, setCodigoEditado] = useState(false)
  const [terminos, setTerminos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [fase, setFase] = useState<Fase>({ tipo: "form" })
  const consulta = useRef(0)
  const logoRef = useRef<HTMLInputElement>(null)
  const clientesRef = useRef<HTMLInputElement>(null)

  // Subdominio: sugerido desde el nombre mientras no lo edite a mano
  const codigo = codigoEditado ? form.codigo : sugerir(form.nombre)

  // Verificación de disponibilidad en vivo (con espera de 450 ms); el resultado queda asociado a su código
  const [resultado, setResultado] = useState<{ codigo: string; ok: boolean; mensaje?: string } | null>(null)
  useEffect(() => {
    if (!codigo) return
    const n = ++consulta.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos-registro/disponible?codigo=${encodeURIComponent(codigo)}`)
        const d = await r.json()
        if (n !== consulta.current) return
        if (!r.ok) setResultado({ codigo, ok: false, mensaje: d.error ?? "No pudimos verificar." })
        else setResultado({ codigo, ok: !!d.disponible, mensaje: d.error ?? "No disponible." })
      } catch {
        if (n === consulta.current) setResultado({ codigo, ok: false, mensaje: "Sin conexión." })
      }
    }, 450)
    return () => clearTimeout(t)
  }, [codigo])
  const disp: Disp = !codigo ? { estado: "vacio" }
    : resultado?.codigo !== codigo ? { estado: "revisando" }
    : resultado.ok ? { estado: "ok" } : { estado: "error", mensaje: resultado.mensaje }

  // Consulta del estado de la instalación
  useEffect(() => {
    if (fase.tipo !== "preparando") return
    let vivo = true
    const tick = async () => {
      try {
        const r = await fetch(`/api/pos-registro/estado?id=${fase.id}&t=${encodeURIComponent(fase.token)}`, { cache: "no-store" })
        const d = await r.json()
        if (!vivo) return
        if (d.estado === "LISTO" && d.url) setFase({ tipo: "listo", url: d.url, abrir: `/api/pos-registro/abrir?id=${encodeURIComponent(fase.id)}&t=${encodeURIComponent(fase.token)}`, nombre: fase.nombre, conMenu: !!d.conMenu, resultado: d.resultado ?? null })
        else if (d.estado === "ERROR") setFase({ tipo: "error", nombre: fase.nombre })
      } catch { /* reintenta en el próximo ciclo */ }
    }
    tick()
    const iv = setInterval(tick, 4000)
    return () => { vivo = false; clearInterval(iv) }
  }, [fase])

  async function elegirLogo(f: File | null) {
    setError("")
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    if (!f) { setLogo(null); setLogoPreview(null); return }
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setError("El logo debe ser PNG, JPG o WebP."); setLogo(null); setLogoPreview(null); return }
    const copia = await logoEnMemoria(f)
    if (!copia) { setError("No pudimos leer esa imagen. Elígela de nuevo o prueba con otra (PNG o JPG)."); setLogo(null); setLogoPreview(null); return }
    if (copia.size > LOGO_MAX) { setError("El logo pesa más de 5 MB."); setLogo(null); setLogoPreview(null); return }
    setLogo(copia)
    setLogoPreview(URL.createObjectURL(copia))
  }

  async function elegirClientes(f: File | null) {
    setError("")
    if (!f) { setClientes(null); return }
    if (f.size > CLIENTES_MAX) { setError("El archivo de clientes pesa más de 10 MB."); return }
    if (!/\.(xlsx|csv)$/i.test(f.name)) { setError("Sube un Excel (.xlsx) o CSV (.csv)."); return }
    const copia = await enMemoria(f)
    if (!copia) { setError("No pudimos leer ese archivo. Elígelo de nuevo."); setClientes(null); return }
    setClientes(copia)
  }

  function validarPaso1(): string {
    if (form.nombre.trim().length < 2) return "Escribe el nombre del restaurante."
    if (disp.estado !== "ok") return disp.mensaje ?? "Revisa la dirección de tu sistema."
    if (form.dueno.trim().length < 2) return "Escribe tu nombre."
    if (!EMAIL_RE.test(form.email.trim())) return "Escribe un correo válido."
    if (form.whatsapp.replace(/\D/g, "").length < 8) return "Escribe un WhatsApp válido."
    const m = Number(form.mesas || 0)
    if (!(m >= 0 && m <= 200)) return "Las mesas deben ser entre 0 y 200."
    return ""
  }

  function siguiente(e?: React.FormEvent) {
    e?.preventDefault()
    setError("")
    if (paso === 1) {
      const err = validarPaso1()
      if (err) { setError(err); return }
    }
    setPaso(p => Math.min(p + 1, 3))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (paso < 3) { siguiente(); return }
    const err = validarPaso1()
    if (err) { setError(err); setPaso(1); return }
    if (!terminos) { setError("Acepta los términos para continuar."); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries({ ...form, codigo })) fd.set(k, v)
      fd.set("terminos", "true")
      if (logo) fd.set("logo", logo)
      if (clientes) fd.set("clientes", clientes)
      const r = await fetch("/api/pos-registro", { method: "POST", body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? (r.status === 413 ? "Los archivos son muy pesados." : "No pudimos crear tu cuenta. Intenta de nuevo.")); return }
      if (!d.id) { setFase({ tipo: "recibido" }); return }
      setFase({ tipo: "preparando", id: d.id, token: d.token, nombre: form.nombre })
    } catch {
      setError(logo || clientes
        ? "No pudimos enviar tus datos. Vuelve al paso 2, elige el logo de nuevo (o quítalo) e intenta otra vez."
        : "No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  const botonPrincipal = "w-full py-3.5 rounded-xl text-white font-bold text-[15px] shadow-lg shadow-orange-600/20 transition hover:brightness-105 disabled:opacity-60 inline-flex items-center justify-center gap-2"

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
            ¿Vienes de Fudo? Traemos tu menú y tus clientes.
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
              {/* Indicador de pasos */}
              <ol className="flex items-center gap-2 mb-2">
                {PASOS.map((p, i) => {
                  const activo = paso === p.n, hecho = paso > p.n
                  return (
                    <li key={p.n} className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition ${hecho ? "bg-green-500 text-white" : activo ? "text-white" : "bg-gray-100 text-gray-400"}`}
                        style={activo ? { background: NARANJA } : undefined}>
                        {hecho ? <CheckCircle2 size={16} /> : <p.icono size={15} />}
                      </span>
                      <span className={`text-xs font-semibold whitespace-nowrap ${activo ? "text-gray-900" : "hidden sm:inline text-gray-400"}`}>{p.titulo}</span>
                      {i < PASOS.length - 1 && <span className="flex-1 h-px bg-gray-200 min-w-2" />}
                    </li>
                  )
                })}
              </ol>

              {/* Honeypot: invisible para personas */}
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label>Sitio web <input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></label>
              </div>

              {paso === 1 && (
                <>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Cuéntanos de tu local</h2>
                    <p className="text-sm text-gray-500 mt-1">Con esto dejamos tu sistema configurado.</p>
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
                        placeholder="mirestaurante" value={codigo}
                        onChange={e => { setCodigoEditado(true); setForm({ ...form, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }) }} />
                      <span className="flex items-center pr-4 text-sm text-gray-400 font-mono shrink-0">.hypnosapps.com</span>
                    </div>
                    <p className="mt-1.5 text-xs min-h-[1rem]">
                      {disp.estado === "revisando" && <span className="text-gray-400 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Verificando…</span>}
                      {disp.estado === "ok" && <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={12} className="shrink-0" /> Disponible: <span className="font-mono break-all">{codigo}.hypnosapps.com</span></span>}
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
                      <label htmlFor="whatsapp" className={label}>WhatsApp del local</label>
                      <input id="whatsapp" type="tel" required autoComplete="tel" inputMode="tel" className={input} placeholder="+56 9 1234 5678"
                        value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="direccion" className={label}>Dirección <span className="font-normal text-gray-400">(opcional)</span></label>
                    <input id="direccion" maxLength={160} autoComplete="street-address" className={input} placeholder="Av. Principal 123, Linares"
                      value={form.direccion} onChange={e => setForm({ ...form, direccion: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-[1fr_7rem] gap-4">
                    <div>
                      <label htmlFor="horario" className={label}>Horario <span className="font-normal text-gray-400">(opcional)</span></label>
                      <input id="horario" maxLength={120} className={input} placeholder="Lun a Sáb 12:00–23:00"
                        value={form.horario} onChange={e => setForm({ ...form, horario: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="mesas" className={label}>Mesas</label>
                      <input id="mesas" inputMode="numeric" maxLength={3} className={`${input} text-center`}
                        value={form.mesas} onChange={e => setForm({ ...form, mesas: e.target.value.replace(/[^\d]/g, "") })} />
                    </div>
                  </div>
                </>
              )}

              {paso === 2 && (
                <>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Tu menú y tu logo</h2>
                    <p className="text-sm text-gray-500 mt-1">Todo es opcional, pero así tu sistema queda listo para vender desde el primer día.</p>
                  </div>

                  {/* Logo */}
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><ImagePlus size={16} style={{ color: NARANJA }} /> Logo de tu local</p>
                    <div className="mt-3 flex items-center gap-4">
                      <button type="button" onClick={() => logoRef.current?.click()}
                        className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0 hover:border-orange-400 transition">
                        {logo && logoPreview
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                          : <ImagePlus size={22} className="text-gray-300" />}
                      </button>
                      <div className="min-w-0 text-sm">
                        <button type="button" onClick={() => logoRef.current?.click()} className="font-semibold hover:underline" style={{ color: NARANJA }}>
                          {logo ? "Cambiar logo" : "Subir logo"}
                        </button>
                        {logo && <button type="button" onClick={() => { elegirLogo(null); if (logoRef.current) logoRef.current.value = "" }} className="ml-3 text-gray-400 hover:text-red-600 inline-flex items-center gap-0.5"><X size={13} /> Quitar</button>}
                        <p className="text-xs text-gray-400 mt-1">PNG, JPG o WebP hasta 5 MB. Aparece en tu sistema y en la máquina de pago.</p>
                      </div>
                    </div>
                    <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { void elegirLogo(e.target.files?.[0] ?? null) }} />
                  </div>

                  {/* Menú */}
                  <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4">
                    <label htmlFor="menuUrl" className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Link2 size={16} style={{ color: NARANJA }} /> Link de tu menú online</label>
                    <p className="text-xs text-gray-500 mt-1">Copia el link de tu menú de Fudo (u otro), lo importamos por ti.</p>
                    <input id="menuUrl" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={500}
                      className={`${input} mt-2`} placeholder="https://menu.fu.do/turestaurante"
                      value={form.menuUrl} onChange={e => setForm({ ...form, menuUrl: e.target.value.trim() })} />
                    {!form.menuUrl && <p className="text-xs text-gray-400 mt-1.5">Sin link cargamos una carta de ejemplo que puedes editar.</p>}
                  </div>

                  {/* Clientes */}
                  <div className="rounded-2xl border border-gray-100 p-4">
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><FileSpreadsheet size={16} style={{ color: NARANJA }} /> ¿Vienes de Fudo?</p>
                    <p className="text-xs text-gray-500 mt-1">Sube el Excel de tus clientes y los traemos.</p>
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <button type="button" onClick={() => clientesRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                        <FileSpreadsheet size={15} /> {clientes ? "Cambiar archivo" : "Elegir Excel o CSV"}
                      </button>
                      {clientes && (
                        <span className="text-xs text-gray-600 inline-flex items-center gap-1 min-w-0">
                          <span className="truncate max-w-[180px]">{clientes.name}</span>
                          <button type="button" onClick={() => { elegirClientes(null); if (clientesRef.current) clientesRef.current.value = "" }} className="text-gray-400 hover:text-red-600"><X size={13} /></button>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">.xlsx o .csv, hasta 10 MB.</p>
                    <input ref={clientesRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden"
                      onChange={e => { void elegirClientes(e.target.files?.[0] ?? null) }} />
                  </div>
                </>
              )}

              {paso === 3 && (
                <>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">¡Todo listo!</h2>
                    <p className="text-sm text-gray-500 mt-1">Revisa y crea tu sistema.</p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-700 space-y-1.5">
                    <div className="flex items-center gap-3">
                      {logo && logoPreview
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={logoPreview} alt="" className="w-11 h-11 rounded-xl object-contain bg-white border border-gray-100 p-0.5" />
                        : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: NARANJA }}>{form.nombre.charAt(0).toUpperCase()}</div>}
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{form.nombre}</p>
                        <p className="text-xs font-mono text-gray-500 truncate">{codigo}.hypnosapps.com</p>
                      </div>
                    </div>
                    <p className="pt-1">{form.mesas || 0} mesas{form.horario ? ` · ${form.horario}` : ""}</p>
                    {form.direccion && <p className="text-gray-500">{form.direccion}</p>}
                    <p className="text-gray-500">{form.menuUrl ? "✓ Importaremos tu menú online" : "Carta de ejemplo (sin link de menú)"}</p>
                    {clientes && <p className="text-gray-500">✓ Importaremos tus clientes</p>}
                  </div>
                  <label className="flex gap-3 items-start p-3.5 rounded-xl bg-orange-50/60 border border-orange-100 cursor-pointer">
                    <input type="checkbox" checked={terminos} onChange={e => setTerminos(e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded accent-orange-600 shrink-0" />
                    <span className="text-[13px] text-gray-600 leading-relaxed">
                      Acepto los términos: los primeros <strong>{diasPrueba} días son gratis</strong>; después el plan cuesta <strong>{precio} al mes</strong>,
                      pagado por transferencia. Si no pago, el sistema se suspende. Puedo cancelar cuando quiera.
                    </span>
                  </label>
                </>
              )}

              {error && (
                <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
                </p>
              )}

              <div className="flex gap-3">
                {paso > 1 && (
                  <button type="button" onClick={() => { setError(""); setPaso(p => p - 1) }}
                    className="h-[52px] px-4 rounded-xl border border-gray-200 text-gray-600 font-semibold inline-flex items-center gap-1.5 hover:bg-gray-50">
                    <ArrowLeft size={16} /> Atrás
                  </button>
                )}
                {paso < 3 ? (
                  <button type="submit" className={botonPrincipal} style={{ background: NARANJA }}>
                    {paso === 2 && !logo && !form.menuUrl && !clientes ? "Omitir por ahora" : "Continuar"} <ArrowRight size={16} />
                  </button>
                ) : (
                  <button type="submit" disabled={enviando} className={botonPrincipal} style={{ background: NARANJA }}>
                    {enviando ? <><Loader2 size={18} className="animate-spin" /> Creando tu cuenta…</> : "Crear mi sistema gratis"}
                  </button>
                )}
              </div>
              <p className="text-center text-xs text-gray-400">¿Dudas? Escríbenos al WhatsApp <a className="underline" href="https://wa.me/56933688302">+56 9 3368 8302</a></p>
            </form>
          )}

          {fase.tipo === "preparando" && (
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center text-white" style={{ background: NARANJA }}>
                <Loader2 size={30} className="animate-spin" />
              </div>
              <h2 className="mt-5 text-xl font-bold text-gray-900">Estamos preparando tu sistema</h2>
              <p className="mt-2 text-sm text-gray-500">
                Instalando <strong>{fase.nombre}</strong>{form.menuUrl ? " e importando tu menú" : ""}. Suele tardar 1 a 3 minutos; no cierres esta página.
              </p>
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
              <ul className="mt-5 text-left text-sm space-y-2">
                {fase.resultado?.menu?.ok && (fase.resultado.menu.productos ?? 0) > 0 ? (
                  <li className="flex gap-2 text-green-700"><CheckCircle2 size={16} className="shrink-0 mt-0.5" /> Importamos {fase.resultado.menu.productos} productos de tu menú.</li>
                ) : fase.conMenu ? (
                  <li className="flex gap-2 text-amber-700"><AlertTriangle size={16} className="shrink-0 mt-0.5" />
                    <span>No pudimos importar tu menú; dejamos una carta de ejemplo. <a className="underline font-semibold" href="https://wa.me/56933688302" target="_blank" rel="noreferrer">Te ayudamos por WhatsApp</a>.</span>
                  </li>
                ) : null}
                {fase.resultado?.clientes?.ok && (fase.resultado.clientes.importados ?? 0) > 0 && (
                  <li className="flex gap-2 text-green-700"><CheckCircle2 size={16} className="shrink-0 mt-0.5" /> Importamos {fase.resultado.clientes.importados} clientes.</li>
                )}
                {fase.resultado?.clientes && !fase.resultado.clientes.ok && (
                  <li className="flex gap-2 text-amber-700"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> No pudimos importar tus clientes; lo revisamos contigo.</li>
                )}
              </ul>
              <a href={fase.abrir} target="_blank" rel="noopener"
                className="mt-6 w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style={{ background: NARANJA }}>
                Abrir mi sistema <ExternalLink size={16} />
              </a>
              <p className="mt-3 text-xs text-gray-500">Entras con la sesión ya iniciada, sin contraseña.</p>
              <div className="mt-5 rounded-xl bg-orange-50/70 border border-orange-100 p-3.5 text-left text-sm text-gray-700">
                <p className="font-semibold text-gray-900">Para la próxima vez</p>
                <p className="mt-1">Te enviamos un correo para <strong>crear tu contraseña</strong>. Es una sola: con ella entras a tu sistema desde cualquier equipo y a tu portal, donde ves tu prueba gratis y pagas tu plan.</p>
              </div>
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
