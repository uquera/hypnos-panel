import Link from "next/link"
import { redirect } from "next/navigation"
import {
  AlertTriangle, ArrowRight, BarChart3, ChefHat, CircleDot, CreditCard, ExternalLink, Loader2, Palette, Printer,
  Receipt, ShoppingBag, Users, UtensilsCrossed, Wallet, WifiOff,
} from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireSesionPos } from "@/lib/pos/sesion"
import { estadoPos } from "@/lib/pos/cobro"
import { fechaLarga } from "@/lib/pos/fechas"
import { conAcceso } from "@/lib/pos/acceso"
import { cadenaDe, consolidar, leerLocal, rangoFechas, variacion, type LocalCadena } from "@/lib/pos/cadena"
import { MI } from "../../_components/MarcaMi"
import CopiarLink from "./CopiarLink"

export const metadata = { title: "Inicio — Mi Hypnos" }
export const dynamic = "force-dynamic"

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`

// Primeros pasos dentro del sistema (cada uno abre esa pantalla con la sesión ya iniciada)
const PASOS = [
  { ir: "/menu", icono: UtensilsCrossed, titulo: "Revisa tu carta", detalle: "Productos, precios y categorías. Si importamos tu menú, ya está ahí." },
  { ir: "/configuracion/impresoras", icono: Printer, titulo: "Conecta tu impresora", detalle: "Comandas para cocina y boletas para tus clientes." },
  { ir: "/configuracion", icono: Users, titulo: "Invita a tu equipo", detalle: "Garzones y cajeros con su propio usuario, en Usuarios." },
  { ir: "/restaurante", icono: ChefHat, titulo: "Haz tu primera venta", detalle: "Abre una mesa, envía la comanda a cocina y cobra." },
]

type Plan = { texto: string; corto: string; tono: string }

function planDe(c: Parameters<typeof estadoPos>[0] & { cliente: { fechaVencimiento: Date } | null }): Plan | null {
  const { estado, dias } = estadoPos(c)
  const vence = c.cliente?.fechaVencimiento
  if (!vence) return null
  const d = (n: number | null) => (n === 0 ? "hoy" : `en ${n} día${n === 1 ? "" : "s"}`)
  switch (estado) {
    case "EN_PRUEBA":  return { texto: `Prueba gratis: termina ${d(dias)} (${fechaLarga(vence)}).`, corto: "En prueba", tono: "bg-amber-50 border-amber-100 text-amber-800" }
    case "SUSPENDIDO": return { texto: "Sistema suspendido. Paga el plan para reactivarlo.", corto: "Suspendido", tono: "bg-red-50 border-red-100 text-red-700" }
    case "VENCIDO":    return { texto: `El plan venció el ${fechaLarga(vence)}. Paga pronto para no perder el acceso.`, corto: "Vencido", tono: "bg-red-50 border-red-100 text-red-700" }
    case "POR_VENCER": return { texto: `El plan vence ${d(dias)}.`, corto: "Por vencer", tono: "bg-amber-50 border-amber-100 text-amber-800" }
    case "AL_DIA":     return { texto: `Plan al día hasta el ${fechaLarga(vence)}.`, corto: "Al día", tono: "bg-green-50 border-green-100 text-green-800" }
    default:           return null
  }
}

function Kpi({ icono: Icono, label, valor, detalle }: { icono: typeof Wallet; label: string; valor: string; detalle?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide"><Icono size={14} /> {label}</p>
      <p className="mt-1.5 text-2xl font-bold text-gray-900 tabular-nums">{valor}</p>
      {detalle && <div className="mt-0.5">{detalle}</div>}
    </div>
  )
}

function VsAyer({ actual, anterior }: { actual: number; anterior: number }) {
  const v = variacion(actual, anterior)
  if (v === null) return <span className="text-xs text-gray-400">ayer a esta hora: sin ventas</span>
  return <span className={`text-xs font-semibold ${v >= 0 ? "text-green-700" : "text-red-600"}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}% vs ayer a esta hora</span>
}

// Portada de Mi Hypnos: cómo van hoy los locales del dueño (uno o toda su cadena), el estado de
// cada plan y la entrada a cada sistema. Es a donde llega el dueño al ingresar.
export default async function PosInicioPage() {
  const yo = await requireSesionPos("/pos/inicio")
  const cadena = await cadenaDe(yo.email)
  const ids = cadena ? cadena.cuentas.map((c) => c.id) : [yo.cuentaId]
  const cuentas = await prisma.posCuenta.findMany({
    where: { id: { in: ids } },
    orderBy: { nombre: "asc" },
    include: { cliente: { select: { masterKey: true, fechaVencimiento: true, suspendida: true } } },
  })
  const cuenta = cuentas.find((c) => c.id === yo.cuentaId) ?? cuentas[0]
  if (!cuenta) redirect("/pos/login")

  const esDueno = yo.rol === "DUENO"
  const hoy = rangoFechas("hoy")
  const listos = cuentas.filter((c) => c.estadoAlta === "LISTO" || c.estadoAlta === "MANUAL")
  // rangoFechas termina "ahora": "anterior" es ayer hasta esta misma hora
  const lecturas: LocalCadena[] = await Promise.all(listos.map((c) => leerLocal(c, hoy.desde, hoy.hasta)))
  const total = consolidar(lecturas)
  const porId = new Map(lecturas.map((l) => [l.cuentaId, l]))
  const cajas = lecturas.reduce((n, l) => n + (l.resumen?.cajasAbiertas.length ?? 0), 0)
  const enLinea = lecturas.filter((l) => l.resumen).length

  const listo = cuenta.estadoAlta === "LISTO" || cuenta.estadoAlta === "MANUAL"
  const sso = conAcceso(cuenta)
  const plan = planDe(cuenta)
  const linkSistema = cuenta.posUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  const abrir = (ir?: string, cuentaId?: string) => {
    const q = new URLSearchParams()
    if (ir) q.set("ir", ir)
    if (cuentaId && cuentaId !== yo.cuentaId) q.set("cuenta", cuentaId)
    const s = q.toString()
    return `/api/pos-portal/abrir${s ? `?${s}` : ""}`
  }
  const nuevo = Date.now() - cuenta.createdAt.getTime() < 21 * 86_400_000 && total.pedidos === 0
  const fechaHoy = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Santiago" })

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 first-letter:uppercase">{fechaHoy}</p>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">Hola, {yo.nombre.split(" ")[0]}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {cadena ? `Así van hoy los ${cuentas.length} locales de ${cadena.nombre}.` : `Así va hoy ${cuenta.nombre}.`}
          </p>
        </div>
        {cadena && (
          <Link href="/pos/cadena" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white hover:opacity-90" style={{ background: MI.tinta }}>
            <BarChart3 size={15} /> Reporte completo
          </Link>
        )}
      </div>

      {/* KPIs de hoy */}
      {listos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icono={Wallet} label="Ventas hoy" valor={clp(total.ventas)} detalle={<VsAyer actual={total.ventas} anterior={total.anterior.ventas} />} />
          <Kpi icono={Receipt} label="Pedidos" valor={total.pedidos.toLocaleString("es-CL")} detalle={<VsAyer actual={total.pedidos} anterior={total.anterior.pedidos} />} />
          <Kpi icono={ShoppingBag} label="Ticket promedio" valor={clp(total.ticketPromedio)} />
          <Kpi icono={CircleDot} label="Cajas abiertas" valor={String(cajas)}
            detalle={<span className="text-xs text-gray-500">{enLinea} de {listos.length} local{listos.length === 1 ? "" : "es"} en línea</span>} />
        </div>
      )}

      {/* Locales */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold text-gray-900">{cadena ? "Tus locales" : "Tu local"}</h2>
          {cadena && <span className="text-xs text-gray-400">ventas de hoy</span>}
        </div>
        <ul className="divide-y divide-gray-100">
          {cuentas.map((c) => {
            const l = porId.get(c.id)
            const r = l?.resumen
            const p = planDe(c)
            const cListo = c.estadoAlta === "LISTO" || c.estadoAlta === "MANUAL"
            const caja = r?.cajasAbiertas[0]
            return (
              <li key={c.id} className="px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold text-gray-900 truncate">{c.nombre}</p>
                  <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                    {!cListo ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Instalando</span>
                      : r ? <span className="inline-flex items-center gap-1 text-green-700"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> En línea</span>
                      : <span className="inline-flex items-center gap-1 text-amber-700"><WifiOff size={11} /> {l?.error ?? "Sin conexión"}</span>}
                    {caja && <span>· Caja abierta por {caja.usuario}</span>}
                    {r && !caja && <span>· Caja cerrada</span>}
                  </p>
                </div>
                {r && (
                  <div className="text-right tabular-nums">
                    <p className="font-bold text-gray-900">{clp(r.ventas)}</p>
                    <p className="text-xs text-gray-500">{r.pedidos} pedido{r.pedidos === 1 ? "" : "s"}</p>
                  </div>
                )}
                {p && <span className={`text-xs font-semibold rounded-full border px-2.5 py-1 ${p.tono}`}>{p.corto}</span>}
                {cListo && (
                  <a href={abrir(undefined, c.id)} target="_blank" rel="noopener"
                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold hover:opacity-90"
                    style={{ background: MI.oro, color: MI.tinta }}>
                    Entrar <ExternalLink size={14} />
                  </a>
                )}
              </li>
            )
          })}
        </ul>
        {total.topProductos.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lo más vendido hoy</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {total.topProductos.slice(0, 5).map((p) => (
                <span key={p.nombre} className="text-xs rounded-full bg-gray-100 text-gray-700 px-2.5 py-1">{p.nombre} · {p.cantidad}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start [&>*]:min-w-0">
        {/* Sistema y plan del local de la sesión */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <h2 className="font-bold text-gray-900">{cadena ? `Tu cuenta: ${cuenta.nombre}` : "Tu sistema"}</h2>
          {listo ? (
            <>
              <p className="mt-1 text-sm text-gray-500">
                {sso
                  ? "Entra con un toque: tu sesión se abre sola. Desde otro equipo entras con tu correo y la misma contraseña de este portal."
                  : "Entra a tu sistema con tu correo y contraseña."}
              </p>
              {!cadena && (
                <a href={abrir()} target="_blank" rel="noopener"
                  className="mt-4 w-full h-12 rounded-xl text-base font-bold inline-flex items-center justify-center gap-2 hover:opacity-95 transition"
                  style={{ background: MI.oro, color: MI.tinta }}>
                  Abrir mi sistema <ExternalLink size={17} />
                </a>
              )}
              <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-3.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Link del sistema</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate font-mono text-sm font-semibold text-gray-900">{linkSistema}</span>
                  <CopiarLink url={cuenta.posUrl} />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">Compártelo con tu equipo: cada uno entra con su propio usuario.</p>
              </div>
            </>
          ) : cuenta.estadoAlta === "ERROR" ? (
            <p className="mt-3 flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              Tuvimos un problema instalando tu sistema y nuestro equipo ya lo está revisando. Te avisaremos por correo, o escríbenos al <a className="underline font-semibold" href="https://wa.me/56933688302">WhatsApp</a>.
            </p>
          ) : (
            <p className="mt-3 flex gap-2 text-sm text-gray-600">
              <Loader2 size={16} className="shrink-0 mt-0.5 animate-spin" /> Estamos preparando tu sistema. Suele tardar 1 a 3 minutos; te avisaremos por correo.
            </p>
          )}

          {plan && (
            <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${plan.tono}`}>
              <span>{plan.texto}</span>
              {esDueno && (
                <Link href="/pos/pago" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                  <CreditCard size={14} /> Ver mi plan
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Guía: abierta mientras el local es nuevo */}
        {listo && (
          <details open={nuevo} className="group bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
              <span>
                <span className="block font-bold text-gray-900">{nuevo ? "Primeros pasos" : "Guía rápida"}</span>
                <span className="block text-sm text-gray-500 mt-0.5">Cada paso abre la pantalla correcta de tu sistema.</span>
              </span>
              <ArrowRight size={16} className="text-gray-300 transition group-open:rotate-90 shrink-0" />
            </summary>
            <ol className="mt-4 space-y-2">
              {PASOS.map((p, i) => (
                <li key={p.ir}>
                  <a href={abrir(p.ir)} target="_blank" rel="noopener"
                    className="group/paso flex items-center gap-3 rounded-xl border border-gray-100 p-3 hover:border-amber-200 hover:bg-amber-50/40 transition">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold" style={{ background: MI.oroSuave, color: MI.tinta }}>{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><p.icono size={15} className="text-gray-400" /> {p.titulo}</span>
                      <span className="block text-xs text-gray-500">{p.detalle}</span>
                    </span>
                    <ArrowRight size={16} className="text-gray-300 group-hover/paso:text-amber-600 shrink-0" />
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-gray-500">
              Dentro del sistema tienes la burbuja <strong>«¿Cómo se hace?»</strong>, y nuestro <a className="underline" href="https://wa.me/56933688302">WhatsApp +56 9 3368 8302</a>.
            </p>
          </details>
        )}
      </div>

      {/* Marca de la app en la máquina de pago (opcional) */}
      <Link href="/pos/marca" className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-gray-200 transition">
        <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0"><Palette size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">Marca en la máquina de pago</span>
          <span className="block text-xs text-gray-500">Opcional: logo y colores de la app Hypnos POS en tu máquina TUU.</span>
        </span>
        <ArrowRight size={16} className="text-gray-300 shrink-0" />
      </Link>
    </div>
  )
}
