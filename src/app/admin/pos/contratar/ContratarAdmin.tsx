"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Package, CalendarDays, RefreshCw, Save, Trash2, Plus } from "lucide-react"
import { clp, type Catalogo, type Linea } from "@/lib/pos/contratar-calculo"

export interface PedidoFila {
  id: string; fecha: string; estado: string; medio: string; plan: string; cajas: number
  total: number; descuento: number; cupon: string | null; lineas: Linea[]
  maquinas: number; direccionEnvio: string; despacho: string; seriales: string; marcha: string
  notasAdmin: string; detalle: string | null; mpPaymentId: string | null
  cuenta: { id: string; nombre: string; codigo: string; tipo: string; whatsapp: string; rut: string; razonSocial: string; comuna: string; dueno: string; email: string }
}
export interface CuponFila {
  id: string; codigo: string; tipo: "PORCENTAJE" | "MONTO"; valor: number; soloAnual: boolean
  venceAt: string; usosMax: number | null; usos: number; activo: boolean; notas: string
}

const ESTADO: Record<string, [string, string]> = {
  PENDIENTE: ["Pendiente de pago", "bg-amber-100 text-amber-800"],
  PAGADO: ["Pagado", "bg-green-100 text-green-800"],
  SIN_PAGO: ["Prueba gratis", "bg-gray-100 text-gray-700"],
  ERROR: ["Error al aplicar", "bg-red-100 text-red-800"],
  RECHAZADO: ["Rechazado", "bg-red-100 text-red-800"],
  CANCELADO: ["Cancelado", "bg-gray-100 text-gray-500"],
}
const DESPACHO: [string, string][] = [["POR_DESPACHAR", "Por despachar"], ["DESPACHADA", "Despachada"], ["ENTREGADA", "Entregada"]]
const MARCHA: [string, string][] = [["POR_AGENDAR", "Por agendar"], ["AGENDADA", "Agendada"], ["HECHA", "Hecha"]]
const inp = "h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"

async function llamar(body: Record<string, unknown>) {
  const r = await fetch("/api/pos-admin/contratar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? "Error")
  return d
}

export default function ContratarAdmin({ catalogo, pedidos, cupones }: { catalogo: Catalogo; pedidos: PedidoFila[]; cupones: CuponFila[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState("")
  const [msg, setMsg] = useState("")
  const [filtro, setFiltro] = useState<"tareas" | "todos">("tareas")

  async function hacer(clave: string, body: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return
    setOcupado(clave); setMsg("")
    try {
      const d = await llamar(body)
      if (d.resultado) setMsg(`Mercado Pago: ${d.resultado}`)
      router.refresh()
    } catch (e) { setMsg(e instanceof Error ? e.message : "Error") } finally { setOcupado("") }
  }

  const conTarea = (p: PedidoFila) => p.estado === "PENDIENTE" || p.estado === "ERROR" || p.despacho === "POR_DESPACHAR" || p.despacho === "DESPACHADA" || p.marcha === "POR_AGENDAR" || p.marcha === "AGENDADA"
  const lista = filtro === "tareas" ? pedidos.filter(conTarea) : pedidos

  return (
    <div className="space-y-8">
      {msg && <p className="text-sm rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-900 p-3">{msg}</p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Pedidos</h2>
          <div className="inline-flex p-1 rounded-lg bg-gray-100 text-sm">
            {([["tareas", `Con tareas (${pedidos.filter(conTarea).length})`], ["todos", `Todos (${pedidos.length})`]] as const).map(([v, t]) => (
              <button key={v} onClick={() => setFiltro(v)} className={`px-3 h-8 rounded-md font-semibold ${filtro === v ? "bg-white shadow" : "text-gray-500"}`}>{t}</button>
            ))}
          </div>
        </div>
        {lista.length === 0 && <p className="text-sm text-gray-500 bg-white rounded-2xl border border-gray-100 p-6 text-center">Nada pendiente.</p>}
        {lista.map(p => {
          const [et, ec] = ESTADO[p.estado] ?? [p.estado, "bg-gray-100"]
          return (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/admin/pos/${p.cuenta.id}`} className="font-bold text-gray-900 hover:underline">{p.cuenta.nombre}</Link>
                  <span className="ml-2 text-xs text-gray-400">{p.cuenta.codigo} · {p.cuenta.tipo === "ALMACEN" ? "almacén" : "restaurante"} · {p.fecha}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{p.cuenta.dueno} · {p.cuenta.email} · {p.cuenta.whatsapp}{p.cuenta.rut ? ` · RUT ${p.cuenta.rut} ${p.cuenta.razonSocial} · ${p.cuenta.comuna}` : ""}</p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${ec}`}>{et}</span>
                  <p className="mt-1 font-bold">{clp(p.total)} <span className="text-xs font-normal text-gray-500">{p.medio === "MERCADOPAGO" ? "Mercado Pago" : p.medio === "TRANSFERENCIA" ? "Transferencia" : ""}</span></p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {p.lineas.map(l => `${l.nombre}${l.monto ? ` ${clp(l.monto)}` : " (gratis)"}`).join(" · ")}
                {p.descuento ? ` · cupón ${p.cupon} −${clp(p.descuento)}` : ""}
                {p.mpPaymentId ? <span className="text-gray-400"> · pago MP {p.mpPaymentId}</span> : null}
              </p>
              {p.detalle && <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">{p.detalle}</p>}

              {(p.estado === "PENDIENTE" || p.estado === "ERROR") && (
                <div className="flex flex-wrap gap-2">
                  {p.medio === "MERCADOPAGO" && (
                    <button onClick={() => hacer(`rev-${p.id}`, { accion: "revisar", id: p.id })} className="px-3 h-9 rounded-lg border border-gray-200 text-sm font-semibold inline-flex items-center gap-1.5">
                      {ocupado === `rev-${p.id}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Revisar en Mercado Pago
                    </button>
                  )}
                  <button onClick={() => hacer(`pag-${p.id}`, { accion: "pagado", id: p.id, soloAdicionales: false }, `¿Confirmas que recibiste ${clp(p.total)}? Se registra el plan como pago de licencia y los adicionales como ingreso.`)}
                    className="px-3 h-9 rounded-lg bg-green-600 text-white text-sm font-semibold">Marcar pagado</button>
                  <button onClick={() => hacer(`pag2-${p.id}`, { accion: "pagado", id: p.id, soloAdicionales: true }, "¿El plan ya lo registraste al aprobar el comprobante? Se registrarán solo los adicionales (puesta en marcha y máquina).")}
                    className="px-3 h-9 rounded-lg border border-green-600 text-green-700 text-sm font-semibold">Pagado (plan ya aprobado por comprobante)</button>
                  <button onClick={() => hacer(`can-${p.id}`, { accion: "cancelar", id: p.id }, "¿Cancelar el pedido? El local sigue en prueba.")}
                    className="px-3 h-9 rounded-lg text-sm text-gray-500 hover:text-red-600">Cancelar</button>
                </div>
              )}

              {(p.maquinas > 0 || p.lineas.some(l => l.clave === "marcha")) && p.estado === "PAGADO" && (
                <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-gray-50">
                  {p.maquinas > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><Package size={13} /> {p.maquinas} Point Smart 2 → {p.direccionEnvio}</p>
                      <div className="flex gap-2">
                        <select className={inp} defaultValue={p.despacho} onChange={e => hacer(`des-${p.id}`, { accion: "pedido", id: p.id, despacho: e.target.value })}>
                          {DESPACHO.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                        <input className={`${inp} flex-1`} defaultValue={p.seriales} placeholder="N° de serie (para el premio de revendedor)"
                          onBlur={e => e.target.value !== p.seriales && hacer(`ser-${p.id}`, { accion: "pedido", id: p.id, seriales: e.target.value })} />
                      </div>
                    </div>
                  )}
                  {p.lineas.some(l => l.clave === "marcha") && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-500 flex items-center gap-1"><CalendarDays size={13} /> Puesta en marcha</p>
                      <select className={inp} defaultValue={p.marcha} onChange={e => hacer(`mar-${p.id}`, { accion: "pedido", id: p.id, marcha: e.target.value })}>
                        {MARCHA.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
              <input className={`${inp} w-full`} defaultValue={p.notasAdmin} placeholder="Notas internas"
                onBlur={e => e.target.value !== p.notasAdmin && hacer(`not-${p.id}`, { accion: "pedido", id: p.id, notasAdmin: e.target.value })} />
            </div>
          )
        })}
      </section>

      <Cupones cupones={cupones} hacer={hacer} ocupado={ocupado} />
      <Precios catalogo={catalogo} hacer={hacer} ocupado={ocupado} />
    </div>
  )
}

type Hacer = (clave: string, body: Record<string, unknown>, confirmar?: string) => Promise<void>

function Cupones({ cupones, hacer, ocupado }: { cupones: CuponFila[]; hacer: Hacer; ocupado: string }) {
  const vacio = { id: "", codigo: "", tipo: "PORCENTAJE" as const, valor: 10, soloAnual: false, venceAt: "", usosMax: null as number | null, activo: true, notas: "" }
  const [f, setF] = useState<typeof vacio | (Omit<CuponFila, "usos" | "tipo"> & { tipo: "PORCENTAJE" | "MONTO" })>(vacio)
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-gray-900">Cupones</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs font-semibold text-gray-500">Código<br /><input className={inp} value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value.toUpperCase() })} placeholder="BIENVENIDO" /></label>
          <label className="text-xs font-semibold text-gray-500">Tipo<br />
            <select className={inp} value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as "PORCENTAJE" | "MONTO" })}><option value="PORCENTAJE">% del plan</option><option value="MONTO">$ del plan</option></select>
          </label>
          <label className="text-xs font-semibold text-gray-500">Valor<br /><input className={`${inp} w-28`} type="number" value={f.valor} onChange={e => setF({ ...f, valor: Number(e.target.value) })} /></label>
          <label className="text-xs font-semibold text-gray-500">Vence<br /><input className={inp} type="date" value={f.venceAt} onChange={e => setF({ ...f, venceAt: e.target.value })} /></label>
          <label className="text-xs font-semibold text-gray-500">Usos máx.<br /><input className={`${inp} w-24`} type="number" value={f.usosMax ?? ""} onChange={e => setF({ ...f, usosMax: e.target.value ? Number(e.target.value) : null })} placeholder="∞" /></label>
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 h-9"><input type="checkbox" checked={f.soloAnual} onChange={e => setF({ ...f, soloAnual: e.target.checked })} /> Solo anual</label>
          <label className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 h-9"><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Activo</label>
          <input className={`${inp} flex-1 min-w-40`} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Notas (para quién es)" />
          <button onClick={async () => { await hacer("cupon", { accion: "cupon", ...f, id: f.id || undefined, usosMax: f.usosMax ?? "" }); setF(vacio) }}
            className="px-3 h-9 rounded-lg bg-indigo-600 text-white text-sm font-semibold inline-flex items-center gap-1.5">
            {ocupado === "cupon" ? <Loader2 size={14} className="animate-spin" /> : f.id ? <Save size={14} /> : <Plus size={14} />} {f.id ? "Guardar" : "Crear"}
          </button>
          {f.id && <button onClick={() => setF(vacio)} className="text-sm text-gray-500 h-9">Cancelar</button>}
        </div>
        {cupones.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Código</th><th>Descuento</th><th>Vence</th><th>Usos</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {cupones.map(c => (
                <tr key={c.id} className="border-t border-gray-50">
                  <td className="py-1.5 font-mono font-semibold">{c.codigo}</td>
                  <td>{c.tipo === "PORCENTAJE" ? `${c.valor}%` : clp(c.valor)}{c.soloAnual ? " · solo anual" : ""}</td>
                  <td>{c.venceAt || "—"}</td>
                  <td>{c.usos}{c.usosMax != null ? ` / ${c.usosMax}` : ""}</td>
                  <td>{c.activo ? "Activo" : "Inactivo"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button onClick={() => setF({ ...c })} className="text-indigo-600 text-xs font-semibold mr-3">Editar</button>
                    <button onClick={() => hacer(`cb-${c.id}`, { accion: "cupon-borrar", id: c.id }, `¿Borrar el cupón ${c.codigo}?`)} className="text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function Precios({ catalogo, hacer, ocupado }: { catalogo: Catalogo; hacer: Hacer; ocupado: string }) {
  const [c, setC] = useState(catalogo)
  const num = (k: keyof Catalogo, t: string, nota?: string) => (
    <label className="text-xs font-semibold text-gray-500">{t}<br />
      <input className={`${inp} w-36`} type="number" value={c[k] as number} onChange={e => setC({ ...c, [k]: Number(e.target.value) })} />
      {nota && <span className="block font-normal text-gray-400 mt-0.5">{nota}</span>}
    </label>
  )
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-gray-900">Precios de la página</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-4">
          {num("mensualCaja", "Mensual por caja ($)")}
          {num("anualCaja", "Anual por caja ($)", `${(c.anualCaja / c.mensualCaja).toFixed(1)} mensualidades`)}
          {num("marcha", "Puesta en marcha ($)", "0 = no se ofrece")}
          {num("point", "Point Smart 2 ($ c/u)")}
          {num("cuotas", "Cuotas máx. (Mercado Pago)")}
          {num("maxCajas", "Máx. cajas")}
        </div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.pointActiva} onChange={e => setC({ ...c, pointActiva: e.target.checked })} /> Vender Point Smart 2 (apágalo si no hay stock)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.cuotasSinInteres} onChange={e => setC({ ...c, cuotasSinInteres: e.target.checked })} /> Mostrar &quot;sin interés&quot; (actívalo también en tu cuenta de Mercado Pago)</label>
        </div>
        <p className="text-xs text-gray-400">Precios con IVA incluido. Cambiar el mensual no cambia lo que pagan los locales ya creados (cada uno guarda su precio).</p>
        <button onClick={() => hacer("cat", { accion: "catalogo", catalogo: c })} className="px-4 h-9 rounded-lg bg-indigo-600 text-white text-sm font-semibold inline-flex items-center gap-1.5">
          {ocupado === "cat" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar precios
        </button>
      </div>
    </section>
  )
}
