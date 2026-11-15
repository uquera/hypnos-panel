"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChefHat, CreditCard, FileSpreadsheet, ImagePlus, Landmark,
  Loader2, Minus, Plus, ShoppingBasket, Sparkles, Tag, UtensilsCrossed, X,
} from "lucide-react"
import {
  calcularPedido, clp, normalizarRut, formatoRut,
  type Adicional, type Catalogo, type Cupon, type Plan, type TipoNegocio,
} from "@/lib/pos/contratar-calculo"

// Contratación online de Hypnos POS (mobile-first) en 5 pasos: plan → adicionales → datos → pago → listo.
// Los montos que se ven aquí son solo para mostrar: el servidor los recalcula al crear el pedido.

const NARANJA = "#f26522"
const WA = "https://wa.me/56933688302"
const LOGO_MAX = 5 * 1024 * 1024
const CLIENTES_MAX = 10 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const input = "w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-orange-500/15 focus:border-orange-500 transition"
const label = "block text-sm font-semibold text-gray-700 mb-1.5"
const PASOS = ["Plan", "Adicionales", "Tus datos", "Pago"]

async function enMemoria(f: File): Promise<File | null> {
  try { return new File([await f.arrayBuffer()], f.name || "archivo", { type: f.type }) } catch { return null }
}

function sugerir(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "y")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 30).replace(/-+$/, "")
}

export default function ContratarForm({ catalogo: cat, diasPrueba, mpListo, inicial }: {
  catalogo: Catalogo; diasPrueba: number; mpListo: boolean
  inicial: { tipo: TipoNegocio; plan: Plan; cupon: string; origen: string }
}) {
  const [paso, setPaso] = useState(1)
  const [tipo, setTipo] = useState<TipoNegocio>(inicial.tipo)
  const [plan, setPlan] = useState<Plan>(inicial.plan)
  const [cajas, setCajas] = useState(1)
  const [adds, setAdds] = useState<Set<Adicional>>(new Set())
  const [maquinas, setMaquinas] = useState(1)
  const [form, setForm] = useState({
    nombre: "", comuna: "", rut: "", razonSocial: "", dueno: "", whatsapp: "", email: "",
    menuUrl: "", direccionEnvio: "", codigo: "", website: "",
  })
  const [codigoEditado, setCodigoEditado] = useState(false)
  const [logo, setLogo] = useState<File | null>(null)
  const [clientes, setClientes] = useState<File | null>(null)
  const [medio, setMedio] = useState<"MERCADOPAGO" | "TRANSFERENCIA">(mpListo ? "MERCADOPAGO" : "TRANSFERENCIA")
  const [cuponTxt, setCuponTxt] = useState(inicial.cupon)
  const [cupon, setCupon] = useState<{ c: Cupon; desc: string } | null>(null)
  const [cuponMsg, setCuponMsg] = useState("")
  const [terminos, setTerminos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const arriba = useRef<HTMLDivElement>(null)

  const sel = useMemo(() => ({ plan, cajas, adicionales: [...adds], maquinas, cupon: cupon?.c ?? null }), [plan, cajas, adds, maquinas, cupon])
  const pedido = calcularPedido(cat, sel)
  const codigo = codigoEditado ? form.codigo : sugerir(form.nombre)
  const anual = plan === "ANUAL"

  // Disponibilidad del subdominio (con espera)
  const [disp, setDisp] = useState<{ codigo: string; ok: boolean; msg?: string } | null>(null)
  const consulta = useRef(0)
  useEffect(() => {
    if (!codigo) return
    const n = ++consulta.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/pos-registro/disponible?codigo=${encodeURIComponent(codigo)}`)
        const d = await r.json()
        if (n === consulta.current) setDisp({ codigo, ok: r.ok && !!d.disponible, msg: d.error ?? "No disponible." })
      } catch { if (n === consulta.current) setDisp({ codigo, ok: false, msg: "Sin conexión." }) }
    }, 450)
    return () => clearTimeout(t)
  }, [codigo])

  // Cupón precargado por link (?cupon=)
  useEffect(() => { if (inicial.cupon) void aplicarCupon(inicial.cupon) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }, [paso])

  function toggle(a: Adicional) {
    setAdds(prev => {
      const s = new Set(prev)
      if (s.has(a)) s.delete(a)
      else {
        s.add(a)
        if (a === "point") s.delete("tengo")
        if (a === "tengo") s.delete("point")
      }
      return s
    })
  }

  async function aplicarCupon(codigoCupon = cuponTxt) {
    setCuponMsg("")
    if (!codigoCupon.trim()) { setCupon(null); return }
    try {
      const r = await fetch("/api/pos-registro/cupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: codigoCupon }) })
      const d = await r.json()
      if (!r.ok) { setCupon(null); setCuponMsg(d.error ?? "Cupón no válido."); return }
      setCupon({ c: d.cupon, desc: d.descripcion })
      setCuponTxt(d.cupon.codigo)
    } catch { setCuponMsg("No pudimos revisar el cupón.") }
  }

  const rutOk = normalizarRut(form.rut)
  function validarDatos(): string {
    if (form.nombre.trim().length < 2) return "Escribe el nombre del local."
    if (!codigo || (disp?.codigo === codigo && !disp.ok)) return disp?.msg ?? "Elige la dirección de tu sistema."
    if (form.comuna.trim().length < 2) return "Escribe la comuna."
    if (!rutOk) return "Revisa el RUT de la empresa."
    if (form.razonSocial.trim().length < 2) return "Escribe la razón social (o tu nombre si eres persona natural)."
    if (form.dueno.trim().length < 2) return "Escribe tu nombre."
    if (form.whatsapp.replace(/\D/g, "").length < 8) return "Escribe un WhatsApp válido."
    if (!EMAIL_RE.test(form.email.trim())) return "Escribe un correo válido."
    if (pedido.maquinas > 0 && form.direccionEnvio.trim().length < 6) return "Escribe la dirección de despacho de la máquina."
    return ""
  }

  function siguiente() {
    setError("")
    if (paso === 3) { const e = validarDatos(); if (e) { setError(e); return } }
    setPaso(p => Math.min(p + 1, 4))
  }

  async function elegirArchivo(f: File | null, tipoArchivo: "logo" | "clientes") {
    setError("")
    const fijar = tipoArchivo === "logo" ? setLogo : setClientes
    if (!f) { fijar(null); return }
    if (tipoArchivo === "logo" && (!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > LOGO_MAX)) { setError("El logo debe ser PNG, JPG o WebP de hasta 5 MB."); return }
    if (tipoArchivo === "clientes" && (!/\.(xlsx|csv)$/i.test(f.name) || f.size > CLIENTES_MAX)) { setError("Sube un Excel (.xlsx) o CSV de hasta 10 MB."); return }
    const copia = await enMemoria(f)
    if (!copia) { setError("No pudimos leer ese archivo. Elígelo de nuevo."); return }
    fijar(copia)
  }

  async function contratar() {
    setError("")
    const e = validarDatos()
    if (e) { setError(e); setPaso(3); return }
    if (!terminos) { setError("Acepta los términos para continuar."); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      for (const [k, v] of Object.entries({ ...form, codigo, rut: rutOk ?? form.rut })) fd.set(k, v.trim())
      fd.set("tipo", tipo); fd.set("plan", plan); fd.set("cajas", String(cajas))
      fd.set("adicionales", [...adds].join(",")); fd.set("maquinas", String(maquinas))
      fd.set("medio", medio); fd.set("terminos", "true"); fd.set("origen", inicial.origen)
      if (cupon && !pedido.prueba) fd.set("cupon", cupon.c.codigo)
      if (tipo === "ALMACEN") fd.set("mesas", "0")
      if (logo) fd.set("logo", logo)
      if (clientes && adds.has("fudo")) fd.set("clientes", clientes)
      if (!adds.has("fudo")) fd.set("menuUrl", "")
      const r = await fetch("/api/pos-registro/contratar", { method: "POST", body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setError(d.error ?? (r.status === 413 ? "Los archivos son muy pesados." : "No pudimos crear tu cuenta. Intenta de nuevo.")); return }
      if (!d.pedido) { setError("Recibimos tu solicitud. Te escribiremos pronto."); return }
      const listo = `/pos/contratar/listo?p=${encodeURIComponent(d.pedido)}&t=${encodeURIComponent(d.tokenPedido)}`
      window.location.href = d.pagarUrl || listo
    } catch {
      setError("No pudimos conectar con el servidor. Revisa tu internet e intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  const resumen = (
    <div className="space-y-1.5 text-sm">
      {pedido.lineas.map(l => (
        <div key={l.clave} className="flex justify-between gap-3">
          <span className="text-gray-600">{l.nombre}{l.nota && !(l.clave === "plan" && pedido.prueba) ? <span className="text-gray-400"> · {l.nota}</span> : null}</span>
          <span className="font-semibold whitespace-nowrap">
            {l.clave === "plan" && pedido.prueba ? <span className="text-green-600">{diasPrueba} días gratis</span>
              : l.monto === 0 ? <span className="text-green-600">Gratis</span> : clp(l.monto)}
          </span>
        </div>
      ))}
      {pedido.descuento > 0 && (
        <div className="flex justify-between text-green-700"><span>Cupón {cupon?.c.codigo}</span><span className="font-semibold">−{clp(pedido.descuento)}</span></div>
      )}
      <div className="flex justify-between border-t border-gray-100 pt-2 mt-2 text-base font-extrabold">
        <span>Pagas hoy</span><span>{clp(pedido.total)}</span>
      </div>
      {pedido.prueba && <p className="text-xs text-gray-500">Después de la prueba: {clp(pedido.mensualDespues)} al mes. Sin tarjeta para empezar.</p>}
      {!pedido.prueba && plan === "MENSUAL" && <p className="text-xs text-gray-500">Desde el 2.º mes: {clp(pedido.mensualDespues)} al mes.</p>}
      {anual && cat.cuotas > 1 && pedido.total > 0 && medio === "MERCADOPAGO" && (
        <p className="text-xs text-gray-500">Hasta {cat.cuotas} cuotas{cat.cuotasSinInteres ? " sin interés" : ""} con tarjeta de crédito.</p>
      )}
      <p className="text-[11px] text-gray-400 pt-1">Precios con IVA incluido.</p>
    </div>
  )

  const boton = "py-3.5 rounded-xl text-white font-bold text-[15px] shadow-lg shadow-orange-600/20 transition hover:brightness-105 disabled:opacity-60 inline-flex items-center justify-center gap-2"

  return (
    <div className="min-h-screen bg-[#fff7f2]">
      <header className="bg-gray-950 text-white">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-24">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: NARANJA }}><ChefHat size={20} /></div>
            <span className="font-bold tracking-tight text-lg">Hypnos <span style={{ color: NARANJA }}>POS</span></span>
          </div>
          <h1 className="mt-7 text-3xl sm:text-4xl font-extrabold leading-tight max-w-2xl">Contrata tu sistema en 5 pasos</h1>
          <p className="mt-3 text-gray-300 max-w-xl text-[15px]">
            Para restaurantes y almacenes. <strong className="text-white">Sin costo de incorporación</strong>, sin contratos y con {diasPrueba} días gratis en el plan mensual.
          </p>
        </div>
      </header>

      <main ref={arriba} className="max-w-5xl mx-auto px-4 -mt-16 pb-16 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start scroll-mt-4">
        <div className="bg-white rounded-3xl shadow-xl shadow-orange-900/5 border border-orange-100 p-5 sm:p-8">
          {/* Indicador de pasos */}
          <ol className="flex gap-1.5 mb-6">
            {PASOS.map((t, i) => (
              <li key={t} className={`flex-1 text-center text-[11px] font-semibold ${paso === i + 1 ? "text-gray-900" : "text-gray-400"}`}>
                <span className="block h-1.5 rounded-full mb-1.5" style={{ background: paso > i + 1 ? "#22c55e" : paso === i + 1 ? NARANJA : "#f3f4f6" }} />
                {t}
              </li>
            ))}
          </ol>

          {/* Honeypot */}
          <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
            <label>Sitio web <input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} /></label>
          </div>

          {paso === 1 && (
            <section className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Elige tu plan</h2>
                <p className="text-sm text-gray-500 mt-1">Todo incluido: caja, {tipo === "ALMACEN" ? "caja rápida con lector de códigos, inventario" : "mesas, comandas a cocina"}, tienda online, reportes y soporte por WhatsApp.</p>
              </div>
              <div className="inline-flex p-1 rounded-xl bg-gray-100">
                {([["RESTAURANTE", "Restaurante", UtensilsCrossed], ["ALMACEN", "Almacén / botillería", ShoppingBasket]] as const).map(([v, t, I]) => (
                  <button key={v} type="button" onClick={() => setTipo(v)}
                    className={`px-4 h-10 rounded-lg text-sm font-semibold inline-flex items-center gap-2 transition ${tipo === v ? "bg-white shadow text-gray-900" : "text-gray-500"}`}>
                    <I size={16} /> {t}
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {([
                  { v: "MENSUAL" as Plan, t: "Mensual", precio: cat.mensualCaja, sufijo: "/ caja al mes",
                    items: [`${diasPrueba} días gratis, sin tarjeta`, "Sin costo de incorporación", "Pago automático cada mes", "Cancela cuando quieras"] },
                  { v: "ANUAL" as Plan, t: "Anual", precio: cat.anualCaja, sufijo: "/ caja al año",
                    tag: cat.anualCaja < cat.mensualCaja * 12 ? `${Math.round(12 - cat.anualCaja / cat.mensualCaja)} meses gratis` : undefined,
                    items: [`Equivale a ${clp(cat.anualCaja / 12)} al mes`, cat.marcha ? "Puesta en marcha asistida incluida" : "Soporte prioritario", cat.cuotas > 1 ? `Hasta ${cat.cuotas} cuotas${cat.cuotasSinInteres ? " sin interés" : ""}` : "Un solo pago al año", "Precio congelado 12 meses"] },
                ]).map(p => (
                  <button key={p.v} type="button" onClick={() => setPlan(p.v)}
                    className={`relative text-left rounded-2xl border-2 p-4 transition ${plan === p.v ? "border-orange-500 bg-orange-50/60" : "border-gray-200 hover:border-orange-200"}`}>
                    {p.tag && <span className="absolute -top-2.5 right-3 text-[11px] font-bold text-white px-2.5 py-0.5 rounded-full" style={{ background: NARANJA }}>{p.tag}</span>}
                    <p className="font-bold text-gray-900">{p.t}</p>
                    <p className="mt-1 text-3xl font-extrabold text-gray-900">{clp(p.precio)} <span className="text-sm font-medium text-gray-500">{p.sufijo}</span></p>
                    <ul className="mt-3 space-y-1 text-[13px] text-gray-600">
                      {p.items.map(i => <li key={i} className="flex gap-1.5"><Check size={15} className="text-green-600 shrink-0 mt-0.5" />{i}</li>)}
                    </ul>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-semibold text-gray-700">¿Cuántas cajas vas a usar?</span>
                <div className="inline-flex items-center gap-3">
                  <button type="button" aria-label="Menos" onClick={() => setCajas(c => Math.max(1, c - 1))} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"><Minus size={16} /></button>
                  <b className="text-lg w-6 text-center">{cajas}</b>
                  <button type="button" aria-label="Más" onClick={() => setCajas(c => Math.min(cat.maxCajas, c + 1))} className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center"><Plus size={16} /></button>
                </div>
                <span className="text-xs text-gray-400 basis-full">Una caja es un computador, tablet o celular cobrando al mismo tiempo. Los garzones y la cocina no cuentan como caja.</span>
              </div>
            </section>
          )}

          {paso === 2 && (
            <section className="space-y-3">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-gray-900">Agrega lo que necesites</h2>
                <p className="text-sm text-gray-500 mt-1">Todo es opcional. Puedes pedirlo después desde Mi Hypnos.</p>
              </div>
              {([
                cat.marcha > 0 && { a: "marcha" as Adicional, t: "Puesta en marcha asistida", d: `Cargamos tu ${tipo === "ALMACEN" ? "lista de productos" : "carta"}, configuramos tus impresoras y te capacitamos por videollamada.`,
                  precio: anual ? <><span className="text-green-600">Incluida</span><s className="block text-xs text-gray-400 font-medium">{clp(cat.marcha)}</s></> : clp(cat.marcha) },
                cat.pointActiva && { a: "point" as Adicional, t: "Máquina Mercado Pago Point Smart 2", d: "Te llega lista y conectada a tu caja: cobras con tarjeta y el monto pasa solo, sin digitarlo. La comisión de Mercado Pago es aparte.",
                  precio: <>{clp(cat.point)}<span className="block text-xs text-gray-400 font-medium">c/u</span></> },
                { a: "tengo" as Adicional, t: "Ya tengo máquina (TUU o Mercado Pago)", d: "La conectamos a tu caja sin costo.", precio: <span className="text-green-600">Gratis</span> },
                { a: "fudo" as Adicional, t: "Me cambio desde Fudo u otro sistema", d: "Traemos tu carta, precios y clientes. Solo pega el link de tu menú o sube tu Excel.", precio: <span className="text-green-600">Gratis</span> },
              ].filter(Boolean) as { a: Adicional; t: string; d: string; precio: React.ReactNode }[]).map(x => {
                const on = adds.has(x.a)
                return (
                  <div key={x.a} className={`rounded-2xl border-2 p-4 transition ${on ? "border-orange-500 bg-orange-50/60" : "border-gray-200"}`}>
                    <button type="button" onClick={() => toggle(x.a)} className="w-full flex gap-3 items-start text-left">
                      <span className={`w-6 h-6 rounded-lg border-2 shrink-0 mt-0.5 flex items-center justify-center ${on ? "border-orange-500 text-white" : "border-gray-300"}`} style={on ? { background: NARANJA } : undefined}>
                        {on && <Check size={14} />}
                      </span>
                      <span className="flex-1">
                        <span className="block font-bold text-gray-900">{x.t}</span>
                        <span className="block text-[13px] text-gray-500 mt-0.5">{x.d}</span>
                      </span>
                      <span className="font-bold text-sm text-right whitespace-nowrap">{x.precio}</span>
                    </button>
                    {x.a === "point" && on && cajas > 1 && (
                      <div className="mt-3 ml-9 flex items-center gap-3 text-sm">
                        <span className="text-gray-600">¿Cuántas?</span>
                        <button type="button" aria-label="Menos" onClick={() => setMaquinas(m => Math.max(1, m - 1))} className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center"><Minus size={14} /></button>
                        <b>{Math.min(maquinas, cajas)}</b>
                        <button type="button" aria-label="Más" onClick={() => setMaquinas(m => Math.min(cajas, m + 1))} className="w-8 h-8 rounded-full border border-gray-200 bg-white flex items-center justify-center"><Plus size={14} /></button>
                      </div>
                    )}
                  </div>
                )
              })}
            </section>
          )}

          {paso === 3 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Tus datos</h2>
                <p className="text-sm text-gray-500 mt-1">Con esto creamos tu sistema y tu boleta de Hypnos.</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-3 gap-y-4">
                <div>
                  <label className={label}>Nombre del local</label>
                  <input className={input} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder={tipo === "ALMACEN" ? "Botillería El Trébol" : "Restaurante La Esquina"} />
                </div>
                <div>
                  <label className={label}>Comuna</label>
                  <input className={input} value={form.comuna} onChange={e => setForm({ ...form, comuna: e.target.value })} placeholder="Antofagasta" />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Dirección de tu sistema</label>
                  <div className="flex items-center rounded-xl border border-gray-200 bg-white focus-within:ring-4 focus-within:ring-orange-500/15 focus-within:border-orange-500">
                    <input className="flex-1 min-w-0 h-12 pl-4 bg-transparent text-[15px] focus:outline-none" value={codigo}
                      onChange={e => { setCodigoEditado(true); setForm({ ...form, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }) }} placeholder="milocal" />
                    <span className="pr-4 text-sm text-gray-400">.hypnosapps.com</span>
                  </div>
                  {codigo && (disp?.codigo !== codigo
                    ? <p className="mt-1 text-xs text-gray-400">Revisando…</p>
                    : disp.ok ? <p className="mt-1 text-xs text-green-600 font-medium">✓ Disponible</p>
                    : <p className="mt-1 text-xs text-red-600">{disp.msg}</p>)}
                </div>
                <div>
                  <label className={label}>RUT de la empresa</label>
                  <input className={input} value={form.rut} inputMode="text" onChange={e => setForm({ ...form, rut: e.target.value })}
                    onBlur={() => rutOk && setForm(f => ({ ...f, rut: formatoRut(rutOk) }))} placeholder="76.123.456-7" />
                  {form.rut.length >= 8 && (rutOk ? <p className="mt-1 text-xs text-green-600 font-medium">✓ RUT válido</p> : <p className="mt-1 text-xs text-red-600">Revisa el dígito verificador</p>)}
                </div>
                <div>
                  <label className={label}>Razón social</label>
                  <input className={input} value={form.razonSocial} onChange={e => setForm({ ...form, razonSocial: e.target.value })} placeholder="Comercial El Trébol SpA" />
                </div>
                <div>
                  <label className={label}>Tu nombre</label>
                  <input className={input} value={form.dueno} autoComplete="name" onChange={e => setForm({ ...form, dueno: e.target.value })} />
                </div>
                <div>
                  <label className={label}>WhatsApp</label>
                  <input className={input} value={form.whatsapp} inputMode="tel" autoComplete="tel" onChange={e => setForm({ ...form, whatsapp: e.target.value })} placeholder="+56 9 1234 5678" />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Correo <span className="font-normal text-gray-400">(será tu usuario)</span></label>
                  <input className={input} value={form.email} type="email" autoComplete="email" onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>

              {adds.has("fudo") && (
                <fieldset className="rounded-2xl border border-dashed border-gray-200 p-4 space-y-3">
                  <legend className="px-1.5 text-sm font-bold text-gray-800">Tu sistema anterior</legend>
                  <div>
                    <label className={label}>Link de tu menú online <span className="font-normal text-gray-400">(Fudo u otro)</span></label>
                    <input className={input} value={form.menuUrl} onChange={e => setForm({ ...form, menuUrl: e.target.value })} placeholder="https://menu.fu.do/..." />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer">
                    <FileSpreadsheet size={18} className="text-green-600" />
                    {clientes ? <>{clientes.name} <button type="button" onClick={() => setClientes(null)}><X size={14} /></button></> : "Subir Excel de clientes (opcional)"}
                    <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => elegirArchivo(e.target.files?.[0] ?? null, "clientes")} />
                  </label>
                </fieldset>
              )}
              {pedido.maquinas > 0 && (
                <fieldset className="rounded-2xl border border-dashed border-gray-200 p-4">
                  <legend className="px-1.5 text-sm font-bold text-gray-800">Despacho de la máquina</legend>
                  <label className={label}>Dirección de entrega</label>
                  <input className={input} value={form.direccionEnvio} onChange={e => setForm({ ...form, direccionEnvio: e.target.value })} placeholder="Calle, número, depto, comuna" />
                </fieldset>
              )}
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 cursor-pointer w-fit">
                <ImagePlus size={18} style={{ color: NARANJA }} />
                {logo ? <>{logo.name} <button type="button" onClick={() => setLogo(null)}><X size={14} /></button></> : "Subir logo (opcional)"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => elegirArchivo(e.target.files?.[0] ?? null, "logo")} />
              </label>
            </section>
          )}

          {paso === 4 && (
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{pedido.prueba ? "Empieza gratis" : "¿Cómo quieres pagar?"}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {pedido.prueba
                    ? `No pagas nada hoy. Tienes ${diasPrueba} días para probarlo con tu equipo; después activas el pago automático desde Mi Hypnos.`
                    : "Los datos de tu tarjeta los recibe Mercado Pago, nunca Hypnos."}
                </p>
              </div>
              {pedido.prueba ? (
                <div className="rounded-2xl border-2 border-orange-500 bg-orange-50/60 p-4 flex gap-3 items-center">
                  <Sparkles size={22} style={{ color: NARANJA }} />
                  <div><p className="font-bold text-gray-900">{diasPrueba} días gratis, sin tarjeta</p><p className="text-[13px] text-gray-600">Después {clp(pedido.mensualDespues)} al mes. Si no te convence, no pagas nada.</p></div>
                </div>
              ) : (
                <>
                  {([
                    mpListo && { v: "MERCADOPAGO" as const, t: "Mercado Pago", d: `Tarjeta de crédito${anual && cat.cuotas > 1 ? ` (hasta ${cat.cuotas} cuotas${cat.cuotasSinInteres ? " sin interés" : ""})` : ""}, débito o saldo en Mercado Pago. Se activa al instante.`, I: CreditCard, c: "#009ee3" },
                    { v: "TRANSFERENCIA" as const, t: "Transferencia bancaria", d: "Transfiere a Hypnos SpA y sube el comprobante en Mi Hypnos. Tu sistema funciona desde ya y el plan se activa al revisarlo.", I: Landmark, c: "#4b5563" },
                  ].filter(Boolean) as { v: "MERCADOPAGO" | "TRANSFERENCIA"; t: string; d: string; I: typeof CreditCard; c: string }[]).map(o => (
                    <button key={o.v} type="button" onClick={() => setMedio(o.v)}
                      className={`w-full text-left rounded-2xl border-2 p-4 flex gap-3 items-center transition ${medio === o.v ? "border-orange-500 bg-orange-50/60" : "border-gray-200"}`}>
                      <span className={`w-5 h-5 rounded-full shrink-0 ${medio === o.v ? "border-[6px] border-orange-500" : "border-2 border-gray-300"}`} />
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: o.c }}><o.I size={20} /></span>
                      <span><span className="block font-bold text-gray-900">{o.t}</span><span className="block text-[13px] text-gray-500">{o.d}</span></span>
                    </button>
                  ))}
                  <div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input className={`${input} pl-10`} value={cuponTxt} onChange={e => setCuponTxt(e.target.value.toUpperCase())} placeholder="¿Tienes un cupón?" />
                      </div>
                      <button type="button" onClick={() => aplicarCupon()} className="px-4 rounded-xl border border-gray-200 font-semibold text-sm">Aplicar</button>
                    </div>
                    {cupon && <p className="mt-1.5 text-xs font-medium text-green-700">✓ {cupon.desc}{pedido.cuponMotivo ? ` — ${pedido.cuponMotivo}` : ""}</p>}
                    {cuponMsg && <p className="mt-1.5 text-xs text-red-600">{cuponMsg}</p>}
                  </div>
                </>
              )}
              <div className="lg:hidden rounded-2xl bg-gray-50 p-4">{resumen}</div>
              <label className="flex gap-3 items-start p-3.5 rounded-xl bg-orange-50/60 border border-orange-100 cursor-pointer">
                <input type="checkbox" checked={terminos} onChange={e => setTerminos(e.target.checked)} className="mt-0.5 w-5 h-5 rounded accent-orange-600 shrink-0" />
                <span className="text-[13px] text-gray-600 leading-relaxed">
                  Acepto los términos: {pedido.prueba
                    ? <>los primeros <strong>{diasPrueba} días son gratis</strong>; después el plan cuesta <strong>{clp(pedido.mensualDespues)} al mes</strong>.</>
                    : anual ? <>el plan anual cubre <strong>12 meses</strong> desde que se confirma el pago.</>
                    : <>el plan cuesta <strong>{clp(pedido.mensualDespues)} al mes</strong>.</>}
                  {" "}Si no pago, el sistema se suspende. Puedo cancelar cuando quiera.{pedido.maquinas ? " La máquina es mía desde que la recibo y tiene la garantía de Mercado Pago." : ""}
                </span>
              </label>
            </section>
          )}

          {error && (
            <p className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}

          {paso < 4 && (
            <p className="lg:hidden mt-5 flex justify-between text-sm rounded-xl bg-gray-50 px-4 py-2.5">
              <span className="text-gray-600">{pedido.prueba ? `${diasPrueba} días gratis · después ${clp(pedido.mensualDespues)}/mes` : "Pagas hoy"}</span>
              {!pedido.prueba && <b>{clp(pedido.total)}</b>}
            </p>
          )}
          <div className="mt-6 flex gap-3">
            {paso > 1 && (
              <button type="button" onClick={() => { setError(""); setPaso(p => p - 1) }} className="px-5 py-3.5 rounded-xl bg-gray-100 font-semibold text-gray-700 inline-flex items-center gap-1.5">
                <ArrowLeft size={16} /> Atrás
              </button>
            )}
            {paso < 4 ? (
              <button type="button" onClick={siguiente} className={`${boton} flex-1`} style={{ background: NARANJA }}>Continuar <ArrowRight size={16} /></button>
            ) : (
              <button type="button" onClick={contratar} disabled={enviando} className={`${boton} flex-1`} style={{ background: NARANJA }}>
                {enviando ? <><Loader2 size={18} className="animate-spin" /> Creando tu sistema…</>
                  : pedido.prueba ? `Empezar mis ${diasPrueba} días gratis`
                  : medio === "MERCADOPAGO" ? `Pagar ${clp(pedido.total)} con Mercado Pago`
                  : "Contratar y ver datos de transferencia"}
              </button>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-gray-400">¿Dudas? <a href={WA} target="_blank" rel="noreferrer" className="underline">Escríbenos por WhatsApp</a></p>
        </div>

        <aside className="hidden lg:block sticky top-4 bg-white rounded-3xl border border-orange-100 p-5 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">Tu pedido</h3>
          <p className="text-xs text-gray-500 mb-3">{tipo === "ALMACEN" ? "Almacén / botillería" : "Restaurante"}</p>
          {resumen}
        </aside>
      </main>
    </div>
  )
}
