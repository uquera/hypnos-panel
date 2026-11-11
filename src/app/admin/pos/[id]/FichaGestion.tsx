"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  Save, Loader2, CalendarPlus, BadgeCheck, Banknote, PauseCircle, PlayCircle, Mail, RotateCcw, Trash2, Activity, Shield, Paperclip,
} from "lucide-react"
import type { FilaTablero } from "@/lib/pos/tablero"
import { accionPos, postForm } from "../_components/accionPos"

interface Datos {
  nombre: string; dueno: string; email: string; whatsapp: string; notas: string; vence: string; precioMensual: string
  menuUrl: string; mesas: string; direccion: string; horario: string
}

export interface Integrante { id: string; nombre: string }

const input = "w-full h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
const label = "text-xs font-semibold text-gray-500 uppercase tracking-wide"
const btn = "inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border disabled:opacity-50"
const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)
const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date())

export default function FichaGestion({ fila, datos, precioGeneral, tieneDueno, clienteId, integrantes, yoId }: {
  fila: FilaTablero; datos: Datos; precioGeneral: number; tieneDueno: boolean; clienteId: string | null
  integrantes: Integrante[]; yoId: string
}) {
  const router = useRouter()
  // El botón del tablero manda aquí con ?pago=1 para cobrar con el formulario completo
  const abrirPago = useSearchParams().get("pago") === "1"
  const [form, setForm] = useState(datos)
  const [loading, setLoading] = useState("")
  const [panel, setPanel] = useState<"" | "pago" | "prueba" | "eliminar">(abrirPago ? "pago" : "")
  const [pago, setPago] = useState({ monto: String(fila.precio), meses: "1", fechaPago: hoyChile(), notas: "" })
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [custodias, setCustodias] = useState<Record<string, string>>({})
  const [fechaPrueba, setFechaPrueba] = useState("")
  const [confirmar, setConfirmar] = useState("")
  const [forzar, setForzar] = useState(false)

  // El vencimiento del servidor manda: tras registrar un pago (router.refresh) el campo
  // debe tomar la fecha nueva. Si no, al guardar se empujaría la vieja al panel y a la
  // instancia, revirtiendo el pago en silencio.
  const venceServidor = useRef(datos.vence)
  useEffect(() => {
    if (datos.vence !== venceServidor.current) {
      venceServidor.current = datos.vence
      setForm(f => ({ ...f, vence: datos.vence }))
    }
  }, [datos.vence])

  const lic = fila.tieneLicencia
  const instalando = fila.estado === "INSTALANDO"
  const bloqueada = fila.eliminada

  async function run(clave: string, body: Record<string, unknown>, ok: string, despues?: () => void) {
    setLoading(clave)
    const d = await accionPos(fila.id, body)
    setLoading("")
    if (d) {
      if (d.venceIgnorado) toast.warning("El vencimiento cambió mientras tenías esta pantalla abierta (un pago u otro operador): se conservó el de la base.")
      else toast.success(ok)
      despues?.()
      router.refresh()
    }
    return d
  }

  const spin = (k: string, icon: React.ReactNode) => loading === k ? <Loader2 size={13} className="animate-spin" /> : icon

  // ── Registro del pago como ingreso (comprobante + custodia) ──
  const custodiaAsignada = Object.values(custodias).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  // Sin repartir es válido: el custodio pasa a ser quien registra, como en el resto de Ingresos
  const custodiaOk = custodiaAsignada === 0 || Math.abs(custodiaAsignada - Number(pago.monto || 0)) < 0.5

  function dividirIgual() {
    const total = Number(pago.monto || 0)
    if (!total || integrantes.length === 0) return
    const base = Math.floor(total / integrantes.length)
    // El redondeo sobrante va al primero para que el reparto cuadre exacto
    setCustodias(Object.fromEntries(integrantes.map((u, i) =>
      [u.id, String(i === 0 ? total - base * (integrantes.length - 1) : base)])))
  }

  async function registrarPago(e: React.FormEvent) {
    e.preventDefault()
    const reparto = Object.entries(custodias)
      .map(([userId, v]) => ({ userId, monto: parseFloat(v) || 0 }))
      .filter(c => c.monto > 0)

    const fd = new FormData()
    fd.append("monto", pago.monto)
    fd.append("meses", pago.meses)
    fd.append("fechaPago", pago.fechaPago)
    fd.append("notas", pago.notas)
    if (reparto.length > 0) fd.append("custodias", JSON.stringify(reparto))
    if (comprobante) fd.append("comprobante", comprobante)

    setLoading("pago")
    const d = await postForm(`/api/pos-admin/cuentas/${fila.id}/pago`, fd)
    setLoading("")
    if (!d) return
    toast.success("Ingreso registrado; licencia extendida")
    setPanel("")
    setComprobante(null)
    setCustodias({})
    setPago(p => ({ ...p, notas: "" }))
    router.refresh()
  }

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      {/* Datos editables */}
      <form className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4"
        onSubmit={e => {
          e.preventDefault()
          // Solo se manda el vencimiento si el operador lo tocó: así guardar datos nunca
          // revierte la fecha que dejó un pago. venceOriginal deja que el servidor lo
          // descarte si alguien más la cambió mientras esta pantalla estaba abierta.
          const { vence, ...resto } = form
          const cambioVence = vence !== venceServidor.current
          run("guardar", { accion: "guardar", ...resto, ...(cambioVence ? { vence, venceOriginal: venceServidor.current } : {}) }, "Datos guardados")
        }}>
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
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <label className={label}>Link del menú online</label>
            <input className={input} value={form.menuUrl} disabled={bloqueada} placeholder="https://menu.fu.do/…" onChange={e => setForm({ ...form, menuUrl: e.target.value.trim() })} />
          </div>
          <div className="space-y-1">
            <label className={label}>Dirección</label>
            <input className={input} value={form.direccion} disabled={bloqueada} onChange={e => setForm({ ...form, direccion: e.target.value })} />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div className="space-y-1">
              <label className={label}>Horario</label>
              <input className={input} value={form.horario} disabled={bloqueada} onChange={e => setForm({ ...form, horario: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className={label}>Mesas</label>
              <input className={input} inputMode="numeric" value={form.mesas} disabled={bloqueada} onChange={e => setForm({ ...form, mesas: e.target.value.replace(/[^\d]/g, "") })} />
            </div>
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
        {lic && <p className="text-xs text-gray-400">Cambiar el vencimiento se sincroniza con la instancia del restaurante. Menú, mesas, dirección y horario se usan al reintentar la instalación.</p>}
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
          <form className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 space-y-2" onSubmit={registrarPago}>
            <p className="text-xs text-gray-500">Queda como ingreso en la caja de Hypnos y extiende la licencia desde el vencimiento actual (o desde hoy si ya venció).</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Monto<input className={input} inputMode="numeric" value={pago.monto} onChange={e => setPago({ ...pago, monto: e.target.value.replace(/[^\d]/g, "") })} /></label>
              <label className="text-xs text-gray-500">Meses
                <select className={input} value={pago.meses} onChange={e => setPago({ ...pago, meses: e.target.value })}>{[1, 2, 3, 6, 12].map(m => <option key={m}>{m}</option>)}</select>
              </label>
              <label className="text-xs text-gray-500">Fecha de pago<input className={input} type="date" max={hoyChile()} value={pago.fechaPago} onChange={e => setPago({ ...pago, fechaPago: e.target.value })} /></label>
              <label className="text-xs text-gray-500">Nota<input className={input} value={pago.notas} onChange={e => setPago({ ...pago, notas: e.target.value })} /></label>
            </div>

            {/* Comprobante: mismo destino que el resto de los ingresos (uploads/comprobantes) */}
            <label className="block text-xs text-gray-500">
              Comprobante <span className="text-gray-400">(imagen o PDF, hasta 8 MB)</span>
              <div className="mt-1 flex items-center gap-2">
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => setComprobante(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-gray-600 file:mr-2 file:px-3 file:h-8 file:rounded-lg file:border file:border-gray-200 file:bg-white file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-50" />
              </div>
              {comprobante
                ? <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700"><Paperclip size={11} /> {comprobante.name}</span>
                : <span className="mt-1 block text-xs text-amber-600">Sin comprobante el ingreso queda sin respaldo en la caja.</span>}
            </label>

            {/* Custodia del dinero: quién lo tiene, no quién lo registra */}
            <div className="pt-1 border-t border-gray-200/70">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-600">Custodia del ingreso</span>
                {integrantes.length > 1 && (
                  <button type="button" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium" onClick={dividirIgual}>Dividir igual</button>
                )}
              </div>
              <div className="space-y-1.5">
                {integrantes.map(u => (
                  <div key={u.id} className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">{u.nombre.charAt(0).toUpperCase()}</span>
                    <span className="text-xs font-medium text-gray-700 truncate flex-1">
                      {u.nombre.split(" ")[0]}{u.id === yoId && <span className="text-gray-400 ml-1">(yo)</span>}
                    </span>
                    <input type="number" min="0" step="1" placeholder="0" value={custodias[u.id] ?? ""}
                      onChange={e => setCustodias({ ...custodias, [u.id]: e.target.value })}
                      className="w-24 h-8 px-2 rounded-lg border border-gray-200 bg-white text-xs text-right focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                    <button type="button" title="Todo para este" className="text-xs text-gray-400 hover:text-indigo-600 px-1 shrink-0"
                      onClick={() => setCustodias(Object.fromEntries(integrantes.map(i => [i.id, i.id === u.id ? pago.monto : "0"])))}>100%</button>
                  </div>
                ))}
              </div>
              <p className={`mt-1.5 px-2 py-1 rounded-lg text-xs font-medium ${custodiaOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {custodiaAsignada === 0
                  ? `Sin repartir: queda a nombre de quien registra`
                  : custodiaOk ? `Repartido: ${clp(custodiaAsignada)}` : `Faltan ${clp(Number(pago.monto || 0) - custodiaAsignada)} por asignar`}
              </p>
            </div>

            <button type="submit" disabled={!!loading || !custodiaOk} className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>
              {spin("pago", <Banknote size={13} />)} Registrar {pago.monto ? clp(Number(pago.monto)) : ""}
            </button>
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
