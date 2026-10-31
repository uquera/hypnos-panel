"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Loader2, Store } from "lucide-react"
import { postJson } from "../_components/accionPos"

const input = "w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
const label = "text-xs font-semibold text-gray-500 uppercase tracking-wide"

function sugerir(nombre: string): string {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "y")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").slice(0, 30).replace(/-+$/, "")
}

export default function CrearRestauranteForm({ precioGeneral, diasPrueba, venceDefecto }: {
  precioGeneral: number; diasPrueba: number; venceDefecto: string
}) {
  const router = useRouter()
  const [f, setF] = useState({ nombre: "", dueno: "", email: "", whatsapp: "", codigo: "", vence: venceDefecto, precioMensual: "" })
  const [editado, setEditado] = useState(false)
  const [prueba, setPrueba] = useState(true)
  const [resultado, setResultado] = useState<{ codigo: string; ok: boolean; msg?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const n = useRef(0)
  const codigo = editado ? f.codigo : sugerir(f.nombre)

  useEffect(() => {
    if (!codigo) return
    const k = ++n.current
    const t = setTimeout(async () => {
      const r = await fetch(`/api/pos-registro/disponible?codigo=${encodeURIComponent(codigo)}`).catch(() => null)
      const d = await r?.json().catch(() => null)
      if (k === n.current) setResultado(d ? { codigo, ok: !!d.disponible, msg: d.error ?? undefined } : { codigo, ok: false, msg: "No se pudo verificar" })
    }, 400)
    return () => clearTimeout(t)
  }, [codigo])
  const disp = !codigo || resultado?.codigo !== codigo ? { ok: null as boolean | null, msg: undefined as string | undefined } : { ok: resultado.ok, msg: resultado.msg }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    if (disp.ok === false) { toast.error(disp.msg ?? "Subdominio no disponible"); return }
    setLoading(true)
    const d = await postJson("/api/pos-admin/restaurantes", { ...f, codigo, prueba, precioMensual: Number(f.precioMensual) || undefined })
    setLoading(false)
    if (d?.id) {
      toast.success("Restaurante creado; instalando su sistema…")
      router.push(`/admin/pos/${d.id}`)
    }
  }

  return (
    <form onSubmit={crear} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
      <div className="space-y-1.5">
        <label className={label} htmlFor="nombre">Nombre del restaurante</label>
        <input id="nombre" required maxLength={60} className={input} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <label className={label} htmlFor="codigo">Subdominio</label>
        <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500">
          <input id="codigo" required maxLength={30} className="flex-1 min-w-0 h-11 pl-3.5 bg-transparent text-sm font-mono focus:outline-none"
            value={codigo} onChange={e => { setEditado(true); setF({ ...f, codigo: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }) }} />
          <span className="pr-3.5 text-sm text-gray-400 font-mono">.hypnosapps.com</span>
        </div>
        <p className="text-xs min-h-4">
          {disp.ok === true && <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Disponible</span>}
          {disp.ok === false && <span className="text-red-600">{disp.msg}</span>}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={label} htmlFor="dueno">Nombre del dueño</label>
          <input id="dueno" required maxLength={80} className={input} value={f.dueno} onChange={e => setF({ ...f, dueno: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label className={label} htmlFor="whatsapp">WhatsApp</label>
          <input id="whatsapp" required className={input} placeholder="+56 9 …" value={f.whatsapp} onChange={e => setF({ ...f, whatsapp: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={label} htmlFor="email">Correo del dueño</label>
        <input id="email" type="email" required className={input} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      </div>

      <div className="rounded-xl border border-gray-100 p-4 space-y-3">
        <label className="flex items-center gap-2.5 text-sm font-medium text-gray-800">
          <input type="checkbox" checked={prueba} onChange={e => setPrueba(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          Prueba gratis de {diasPrueba} días
        </label>
        {!prueba && (
          <div className="space-y-1.5">
            <label className={label} htmlFor="vence">Vencimiento (cliente pagado)</label>
            <input id="vence" type="date" required className={input} value={f.vence} onChange={e => setF({ ...f, vence: e.target.value })} />
          </div>
        )}
        <div className="space-y-1.5">
          <label className={label} htmlFor="precio">Precio mensual especial (CLP, opcional)</label>
          <input id="precio" inputMode="numeric" className={input} placeholder={`General: ${precioGeneral.toLocaleString("es-CL")}`}
            value={f.precioMensual} onChange={e => setF({ ...f, precioMensual: e.target.value.replace(/[^\d]/g, "") })} />
        </div>
      </div>

      <button type="submit" disabled={loading}
        className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Store size={16} />} Crear e instalar
      </button>
    </form>
  )
}
