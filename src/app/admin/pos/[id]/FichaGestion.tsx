"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Save, Loader2, CalendarPlus, BadgeCheck, Banknote, PauseCircle, PlayCircle, Mail, RotateCcw, Trash2, Activity, Shield,
} from "lucide-react"
import type { FilaTablero } from "@/lib/pos/tablero"
import { accionPos } from "../_components/accionPos"

interface Datos {
  nombre: string; dueno: string; email: string; whatsapp: string; notas: string; vence: string; precioMensual: string
}

const input = "w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
const label = "text-xs font-semibold text-gray-500 uppercase tracking-wide"
const btn = "inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border disabled:opacity-50"
const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)
const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date())

export default function FichaGestion({ fila, datos, precioGeneral, tieneDueno, clienteId }: {
  fila: FilaTablero; datos: Datos; precioGeneral: number; tieneDueno: boolean; clienteId: string | null
}) {
  const router = useRouter()
  const [form, setForm] = useState(datos)
  const [loading, setLoading] = useState("")
  const [panel, setPanel] = useState<"" | "pago" | "prueba" | "eliminar">("")
  const [pago, setPago] = useState({ monto: String(fila.precio), meses: "1", fechaPago: hoyChile(), notas: "" })
  const [fechaPrueba, setFechaPrueba] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [forzar, setForzar] = useState(false)

  const lic = fila.tieneLicencia
  const instalando = fila.estado === "INSTALANDO"
  const bloqueada = fila.eliminada

  async function run(clave: string, body: Record<string, unknown>, ok: string, despues?: () => void) {
    setLoading(clave)
    const d = await accionPos(fila.id, body)
    setLoading("")
    if (d) {
      toast.success(ok)
      despues?.()
      router.refresh()
    }
    return d
  }

  const spin = (k: string, icon: React.ReactNode) => loading === k ? <Loader2 size={13} className="animate-spin" /> : icon

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* Datos editables */}
      <form className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4"
        onSubmit={e => { e.preventDefault(); run("guardar", { accion: "guardar", ...form }, "Datos guardados") }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Datos y licencia</h2>
          {clienteId && <Link href={`/admin/clientes/${clienteId}`} className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"><Shield size={12} /> Ver en gobernanza</Link>}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={label}>Restaurante</label>
            <input className={input} value={form.nombre} disabled={bloqueada} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={label}>WhatsApp</label>
            <input className={input} value={form.whatsapp} disabled={bloqueada} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          {tieneDueno && <>
            <div className="space-y-1">
              <label className={label}>Dueño</label>
              <input className={input} value={form.dueno} disabled={bloqueada} onChange={e => setForm({ ...form, dueno: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className={label}>Correo del dueño</label>
              <input className={input} type="email" value={form.email} disabled={bloqueada} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
          </>}
          {lic && (
            <div className="space-y-1">
              <label className={label}>Vencimiento</label>
              <input className={input} type="date" value={form.vence} disabled={bloqueada} onChange={e => setForm({ ...form, vence: e.target.value })} />
            </div>
          )}
          <div className="space-y-1">
            <label className={label}>Precio mensual (CLP)</label>
            <input className={input} inputMode="numeric" placeholder={`General: ${precioGeneral.toLocaleString("es-CL")}`} value={form.precioMensual} disabled={bloqueada}
              onChange={e => setForm({ ...form, precioMensual: e.target.value.replace(/[^\d]/g, "") })} />
          </div>
        </div>
        {lic && (
          <div className="space-y-1">
            <label className={label}>Notas internas</label>
            <textarea rows={3} className={`${input} h-auto py-2`} value={form.notas} disabled={bloqueada} onChange={e => setForm({ ...form, notas: e.target.value })} />
          </div>
        )}
        {!bloqueada && (
          <button type="submit" disabled={!!loading}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
            {spin("guardar", <Save size={14} />)} Guardar
          </button>
        )}
        {lic && <p className="text-xs text-gray-400">Cambiar el vencimiento se sincroniza con la instancia del restaurante.</p>}
      </form>

      {/* Acciones */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <h2 className="text-base font-bold text-gray-900">Acciones</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <p>Precio: <strong>{clp(fila.precio)}</strong>{fila.precioEspecial ? " (especial)" : ""}</p>
          {fila.manual && <p className="text-xs text-gray-500">Instalación manual: no se instala ni elimina desde el panel{lic ? "" : " y no tiene licencia en la gobernanza"}.</p>}
        </div>

        {bloqueada ? <p className="text-sm text-gray-500">Restaurante eliminado. Su historial se conserva.</p> : (
          <div className="flex flex-wrap gap-2">
            {lic && !instalando && fila.estadoAlta !== "ERROR" && <>
              <button type="button" className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`} disabled={!!loading} onClick={() => setPanel(panel === "pago" ? "" : "pago")}>
                <Banknote size={13} /> Registrar pago
              </button>
              {fila.suspendida
                ? <button type="button" className={`${btn} border-green-200 text-green-700 hover:bg-green-50`} disabled={!!loading} onClick={() => run("sus", { accion: "reactivar" }, "Reactivado")}>{spin("sus", <PlayCircle size={13} />)} Reactivar</button>
                : <button type="button" className={`${btn} border-red-200 text-red-600 hover:bg-red-50`} disabled={!!loading}
                    onClick={() => confirm(`¿Suspender ${fila.nombre}? Su sistema dejará de funcionar hasta reactivarlo.`) && run("sus", { accion: "suspender" }, "Suspendido")}>{spin("sus", <PauseCircle size={13} />)} Suspender</button>}
            </>}
            {lic && <>
              <button type="button" className={`${btn} border-sky-200 text-sky-700 hover:bg-sky-50`} disabled={!!loading} onClick={() => setPanel(panel === "prueba" ? "" : "prueba")}>
                <CalendarPlus size={13} /> Extender prueba
              </button>
              {fila.enPrueba && (
                <button type="button" className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`} disabled={!!loading}
                  onClick={() => confirm("¿Pasar a cliente pagado? Se quita la marca de prueba (el vencimiento no cambia).") && run("pagado", { accion: "pasar-pagado" }, "Ahora es cliente pagado")}>
                  {spin("pagado", <BadgeCheck size={13} />)} Pasar a cliente pagado
                </button>
              )}
            </>}
            {tieneDueno && (
              <button type="button" className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`} disabled={!!loading}
                onClick={() => run("inv", { accion: "reenviar" }, "Invitación reenviada")}>
                {spin("inv", <Mail size={13} />)} Reenviar invitación
              </button>
            )}
            {!fila.manual && <>
              {(fila.estadoAlta === "ERROR" || fila.estancada) && (
                <button type="button" className={`${btn} border-indigo-200 text-indigo-700 hover:bg-indigo-50`} disabled={!!loading}
                  onClick={() => run("re", { accion: "reintentar" }, "Instalación relanzada")}>{spin("re", <RotateCcw size={13} />)} Reintentar instalación</button>
              )}
              <button type="button" className={`${btn} border-gray-200 text-gray-700 hover:bg-gray-50`} disabled={!!loading}
                onClick={async () => {
                  const d = await run("ver", { accion: "verificar" }, "Consulta hecha")
                  if (d) alert(JSON.stringify(d.estado, null, 2))
                }}>{spin("ver", <Activity size={13} />)} Verificar instancia</button>
              <button type="button" className={`${btn} border-red-200 text-red-600 hover:bg-red-50`} disabled={!!loading} onClick={() => setPanel(panel === "eliminar" ? "" : "eliminar")}>
                <Trash2 size={13} /> Eliminar
              </button>
            </>}
          </div>
        )}

        {panel === "pago" && (
          <form className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2"
            onSubmit={e => { e.preventDefault(); run("pago", { accion: "pago-manual", ...pago }, "Pago registrado; licencia extendida", () => setPanel("")) }}>
            <p className="text-xs text-gray-500">Pago sin comprobante (efectivo, transferencia ya verificada…). Extiende desde el vencimiento actual o desde hoy.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Monto<input className={input} inputMode="numeric" value={pago.monto} onChange={e => setPago({ ...pago, monto: e.target.value.replace(/[^\d]/g, "") })} /></label>
              <label className="text-xs text-gray-500">Meses
                <select className={input} value={pago.meses} onChange={e => setPago({ ...pago, meses: e.target.value })}>{[1, 2, 3, 6, 12].map(m => <option key={m}>{m}</option>)}</select>
              </label>
              <label className="text-xs text-gray-500">Fecha de pago<input className={input} type="date" value={pago.fechaPago} onChange={e => setPago({ ...pago, fechaPago: e.target.value })} /></label>
              <label className="text-xs text-gray-500">Nota<input className={input} value={pago.notas} onChange={e => setPago({ ...pago, notas: e.target.value })} /></label>
            </div>
            <button type="submit" disabled={!!loading} className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>{spin("pago", <Banknote size={13} />)} Registrar {pago.monto ? clp(Number(pago.monto)) : ""}</button>
          </form>
        )}

        {panel === "prueba" && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2">
            <p className="text-xs text-gray-500">Suma días desde el vencimiento actual (o desde hoy si ya venció) y deja la cuenta en prueba.</p>
            <div className="flex flex-wrap gap-2">
              {[7, 14].map(d => (
                <button key={d} type="button" disabled={!!loading} className={`${btn} border-sky-200 text-sky-700 hover:bg-sky-50`}
                  onClick={() => run(`p${d}`, { accion: "extender-prueba", dias: d }, `Prueba extendida ${d} días`, () => setPanel(""))}>{spin(`p${d}`, <CalendarPlus size={13} />)} +{d} días</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="date" className={input} value={fechaPrueba} onChange={e => setFechaPrueba(e.target.value)} />
              <button type="button" disabled={!fechaPrueba || !!loading} className={`${btn} border-sky-200 text-sky-700 hover:bg-sky-50 shrink-0`}
                onClick={() => run("pf", { accion: "extender-prueba", fecha: fechaPrueba }, "Prueba extendida", () => setPanel(""))}>Hasta esa fecha</button>
            </div>
          </div>
        )}

        {panel === "eliminar" && (
          <div className="rounded-xl border border-red-100 bg-red-50/60 p-3 space-y-2">
            <p className="text-xs text-red-700">Respaldará la base del restaurante y sacará su sistema de línea. Los pagos y el historial se conservan en el panel. Escribe <strong className="font-mono">{fila.codigo}</strong> para confirmar:</p>
            <input className={input} value={confirmar} onChange={e => setConfirmar(e.target.value)} placeholder={fila.codigo} />
            <label className="flex items-center gap-2 text-xs text-red-700">
              <input type="checkbox" checked={forzar} onChange={e => setForzar(e.target.checked)} /> Marcar como eliminada aunque falle el comando del servidor
            </label>
            <button type="button" disabled={confirmar !== fila.codigo || !!loading} className={`${btn} border-red-600 bg-red-600 text-white hover:bg-red-700`}
              onClick={() => run("del", { accion: "eliminar", confirmar, forzar }, "Restaurante eliminado", () => router.push("/admin/pos"))}>
              {spin("del", <Trash2 size={13} />)} Eliminar definitivamente
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
