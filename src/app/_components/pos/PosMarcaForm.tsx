"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, ImagePlus, Loader2, Save, Trash2 } from "lucide-react"
import PosPhonePreview from "./PosPhonePreview"
import {
  COLORES_DEFECTO, LOGO_MAX_BYTES, contraste, errorCodigo, normalizarHex, normalizarPosUrl,
  type ColoresPos,
} from "@/lib/pos/validacion"

// Formulario de cuenta/marca de Hypnos POS. Lo usan:
//  - modo "crear" / "editar": Hypnos en /admin/pos (todos los campos)
//  - modo "portal": el negocio en /pos/marca (solo nombre visible, colores y logo)

export interface CuentaForm extends ColoresPos {
  id:        string
  codigo:    string
  nombre:    string
  posUrl:    string
  clienteId: string | null
  logoUrl:   string | null
}

interface Props {
  modo:      "crear" | "editar" | "portal"
  cuenta?:   CuentaForm
  clientes?: { id: string; nombre: string }[]
}

const input = "w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
const label = "text-xs font-semibold text-gray-500 uppercase tracking-wide"

const CAMPOS_COLOR: { key: keyof ColoresPos; label: string; ayuda: string }[] = [
  { key: "colorPrimario",      label: "Color principal",      ayuda: "Botones y barra superior" },
  { key: "colorTextoPrimario", label: "Texto sobre principal", ayuda: "Letras dentro de los botones" },
  { key: "colorFondo",         label: "Fondo",                 ayuda: "Fondo de las pantallas" },
  { key: "colorTexto",         label: "Texto",                 ayuda: "Letras sobre el fondo" },
]

export default function PosMarcaForm({ modo, cuenta, clientes = [] }: Props) {
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)
  const esAdmin  = modo !== "portal"
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    codigo:    cuenta?.codigo ?? "",
    nombre:    cuenta?.nombre ?? "",
    posUrl:    cuenta?.posUrl ?? "",
    clienteId: cuenta?.clienteId ?? "",
  })
  const [colores, setColores] = useState<ColoresPos>({
    colorPrimario:      cuenta?.colorPrimario      ?? COLORES_DEFECTO.colorPrimario,
    colorTextoPrimario: cuenta?.colorTextoPrimario ?? COLORES_DEFECTO.colorTextoPrimario,
    colorFondo:         cuenta?.colorFondo         ?? COLORES_DEFECTO.colorFondo,
    colorTexto:         cuenta?.colorTexto         ?? COLORES_DEFECTO.colorTexto,
  })
  // Texto libre de cada campo hex (puede estar a medio escribir)
  const [hexTxt, setHexTxt] = useState<ColoresPos>(colores)
  const [logo, setLogo]               = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(cuenta?.logoUrl ?? null)
  const [quitarLogo, setQuitarLogo]   = useState(false)

  const avisos = useMemo(() => {
    const a: string[] = []
    if (contraste(colores.colorPrimario, colores.colorTextoPrimario) < 3) a.push("El texto de los botones se lee poco sobre el color principal.")
    if (contraste(colores.colorFondo, colores.colorTexto) < 4.5) a.push("El texto se lee poco sobre el fondo.")
    return a
  }, [colores])

  function setColor(key: keyof ColoresPos, valor: string) {
    setHexTxt(h => ({ ...h, [key]: valor }))
    const hex = normalizarHex(valor)
    if (hex) setColores(c => ({ ...c, [key]: hex }))
  }

  function elegirLogo(f: File | undefined) {
    if (!f) return
    if (f.size > LOGO_MAX_BYTES) { toast.error("El logo pesa más de 2 MB."); return }
    if (!/\.(png|jpe?g|svg)$/i.test(f.name) && !/^image\/(png|jpeg|svg\+xml)$/.test(f.type)) {
      toast.error("El logo debe ser PNG, JPG o SVG."); return
    }
    setLogo(f)
    setQuitarLogo(false)
    // Vista previa local; se libera la URL temporal del archivo anterior
    setLogoPreview(prev => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev)
      return URL.createObjectURL(f)
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (esAdmin) {
      const err = errorCodigo(form.codigo)
      if (err) { toast.error(err); return }
      if (!normalizarPosUrl(form.posUrl)) { toast.error("El link debe empezar con https://"); return }
    }
    if (!form.nombre.trim()) { toast.error("Escribe el nombre visible."); return }

    const fd = new FormData()
    fd.set("nombre", form.nombre.trim())
    for (const { key } of CAMPOS_COLOR) fd.set(key, colores[key])
    if (esAdmin) {
      fd.set("codigo", form.codigo)
      fd.set("posUrl", form.posUrl.trim())
      fd.set("clienteId", form.clienteId)
    }
    if (logo) fd.set("logo", logo)
    if (quitarLogo) fd.set("quitarLogo", "1")

    const url = modo === "crear" ? "/api/pos-admin/cuentas"
      : modo === "editar" ? `/api/pos-admin/cuentas/${cuenta!.id}`
      : "/api/pos-portal/marca"

    setLoading(true)
    try {
      const res  = await fetch(url, { method: modo === "crear" ? "POST" : "PATCH", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "No se pudo guardar."); return }
      toast.success(modo === "crear" ? "Cuenta creada" : "Cambios guardados")
      // La página monta el formulario con key = updatedAt: al refrescar se reinicia con lo guardado
      if (modo === "crear") router.push(`/admin/pos/${data.id}`)
      else router.refresh()
    } catch {
      toast.error("Error de red. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  const logoVisible = quitarLogo ? null : logoPreview

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
      <div className="space-y-5 min-w-0">

        {/* Datos que solo maneja Hypnos */}
        {esAdmin && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Cuenta</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={label} htmlFor="codigo">Código</label>
                <input id="codigo" className={`${input} font-mono`} required maxLength={30}
                  value={form.codigo} placeholder="donaany" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  onChange={e => setForm({ ...form, codigo: e.target.value.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "") })} />
                <p className="text-xs text-gray-400">Lo escribe el negocio en la app. Minúsculas, números y guiones.</p>
              </div>
              <div className="space-y-1.5">
                <label className={label} htmlFor="cliente">Cliente de la gobernanza</label>
                <select id="cliente" className={input} value={form.clienteId}
                  onChange={e => setForm({ ...form, clienteId: e.target.value })}>
                  <option value="">Sin vincular</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={label} htmlFor="posUrl">Link del sistema (POS web)</label>
              <input id="posUrl" type="url" className={input} required placeholder="https://donnaany.com/pos"
                value={form.posUrl} onChange={e => setForm({ ...form, posUrl: e.target.value })} />
              <p className="text-xs text-gray-400">La app abre esta página dentro de la máquina y cobra con su tarjeta.</p>
            </div>
          </div>
        )}

        {/* Marca: la edita también el negocio */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
          <h2 className="text-sm font-bold text-gray-900">Marca</h2>

          <div className="space-y-1.5">
            <label className={label} htmlFor="nombre">Nombre visible</label>
            <input id="nombre" className={input} required maxLength={60} placeholder="Doña Any"
              value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          </div>

          {/* Logo */}
          <div className="space-y-1.5">
            <span className={label}>Logo</span>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 shrink-0 rounded-2xl border border-gray-200 flex items-center justify-center overflow-hidden"
                   style={{ background: colores.colorFondo }}>
                {logoVisible
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoVisible} alt="Logo" className="w-full h-full object-contain p-1.5" />
                  : <ImagePlus size={22} className="text-gray-300" />}
              </div>
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="px-3.5 h-9 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                    {logoVisible ? "Cambiar logo" : "Subir logo"}
                  </button>
                  {logoVisible && (
                    <button type="button" onClick={() => { setLogo(null); setQuitarLogo(true) }}
                      className="inline-flex items-center gap-1 px-3 h-9 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} /> Quitar
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">PNG, JPG o SVG hasta 2 MB. Ideal: cuadrado y con fondo transparente.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg" className="hidden"
                onChange={e => { elegirLogo(e.target.files?.[0]); e.target.value = "" }} />
            </div>
          </div>

          {/* Colores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CAMPOS_COLOR.map(({ key, label: l, ayuda }) => (
              <div key={key} className="space-y-1.5">
                <label className={label} htmlFor={key}>{l}</label>
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={l} value={colores[key]}
                    onChange={e => setColor(key, e.target.value)}
                    className="h-11 w-12 shrink-0 rounded-xl border border-gray-200 bg-white p-1 cursor-pointer" />
                  <input id={key} className={`${input} font-mono uppercase`} maxLength={7}
                    value={hexTxt[key]} onChange={e => setColor(key, e.target.value)}
                    onBlur={() => setHexTxt(h => ({ ...h, [key]: colores[key] }))} />
                </div>
                <p className="text-xs text-gray-400">{ayuda}</p>
              </div>
            ))}
          </div>

          {avisos.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs px-3.5 py-2.5 space-y-1">
              {avisos.map(a => <p key={a} className="flex gap-1.5"><AlertTriangle size={13} className="shrink-0 mt-px" />{a}</p>)}
            </div>
          )}
        </div>

        <button type="submit" disabled={loading}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {loading ? "Guardando..." : modo === "crear" ? "Crear cuenta" : "Guardar cambios"}
        </button>
      </div>

      {/* Vista previa */}
      <div className="lg:sticky lg:top-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3 text-center">Así se verá en la máquina</h2>
        <PosPhonePreview nombre={form.nombre} logoUrl={logoVisible} colores={colores} posUrl={form.posUrl} />
      </div>
    </form>
  )
}
