import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { buscarRespaldo } from "@/lib/agenda"
import {
  ArrowLeft, Eye, Users, Scissors, CalendarDays, CalendarClock,
  TrendingUp, TrendingDown, CloudOff, MessageCircle, Mail,
} from "lucide-react"

export const dynamic = "force-dynamic"
export const metadata = { title: "Agenda del lead — Hypnos Panel" }

// ─── Forma de los datos de la agenda (demo/app.js) ──────────────────────────
interface Cliente  { id: string; nombre?: string; telefono?: string }
interface Servicio { id: string; nombre?: string; duracion?: number; precio?: number }
interface Cita     { id: string; clienteId?: string; servicioId?: string; fecha?: string; hora?: string; estado?: string }
interface Mov      { id: string; tipo?: string; categoria?: string; monto?: number; nota?: string; fecha?: string }
interface AgendaData {
  negocio?: string
  perfil?: { titular?: string; telefono?: string; email?: string }
  clientes?: Cliente[]; servicios?: Servicio[]; citas?: Cita[]; movimientos?: Mov[]
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: "Pendiente",  cls: "bg-amber-100 text-amber-700" },
  confirmada: { label: "Confirmada", cls: "bg-emerald-100 text-emerald-700" },
  completada: { label: "Completada", cls: "bg-indigo-100 text-indigo-700" },
  cancelada:  { label: "Cancelada",  cls: "bg-rose-100 text-rose-600" },
}

function clp(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n || 0)
}

function fechaCorta(ymd?: string): string {
  if (!ymd) return "—"
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CL", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  })
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60) return "hace un momento"
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return "ayer"
  if (d < 30) return `hace ${d} días`
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })
}

// ─── Página ─────────────────────────────────────────────────────────────────
export default async function AgendaLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect("/login")
  // Contiene datos personales de los clientes del lead: solo administradores
  if (session.user.role !== "ADMIN") redirect("/admin/leads")

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id } })
  if (!lead) notFound()

  const candidatos = await prisma.agendaBackup.findMany({
    orderBy: { ultimaActividad: "desc" },
    select: { id: true, agendaId: true, slug: true, email: true, telefono: true },
  })
  const match    = buscarRespaldo(lead, candidatos)
  const respaldo = match ? await prisma.agendaBackup.findUnique({ where: { id: match.id } }) : null

  let data: AgendaData = {}
  if (respaldo) {
    try { data = JSON.parse(respaldo.data) } catch { data = {} }
  }

  const clientes  = data.clientes ?? []
  const servicios = data.servicios ?? []
  const citas     = data.citas ?? []
  const movs      = data.movimientos ?? []
  const cliMap    = new Map(clientes.map(c => [c.id, c]))
  const svcMap    = new Map(servicios.map(s => [s.id, s]))

  const hoy   = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }) // YYYY-MM-DD
  const mes   = hoy.slice(0, 7)
  const orden = (c: Cita) => `${c.fecha ?? ""} ${c.hora ?? ""}`

  const proximas  = citas.filter(c => (c.fecha ?? "") >= hoy && c.estado !== "cancelada")
    .sort((a, b) => orden(a).localeCompare(orden(b))).slice(0, 15)
  const recientes = citas.filter(c => (c.fecha ?? "") < hoy)
    .sort((a, b) => orden(b).localeCompare(orden(a))).slice(0, 15)
  const citasMes  = citas.filter(c => (c.fecha ?? "").startsWith(mes)).length

  const movMes = movs.filter(m => (m.fecha ?? "").startsWith(mes))
  const ingMes = movMes.filter(m => m.tipo === "ingreso").reduce((s, m) => s + (Number(m.monto) || 0), 0)
  const egrMes = movMes.filter(m => m.tipo === "egreso").reduce((s, m) => s + (Number(m.monto) || 0), 0)

  const citasPorCliente = new Map<string, number>()
  citas.forEach(c => { if (c.clienteId) citasPorCliente.set(c.clienteId, (citasPorCliente.get(c.clienteId) ?? 0) + 1) })
  const topClientes   = [...clientes].sort((a, b) => (citasPorCliente.get(b.id) ?? 0) - (citasPorCliente.get(a.id) ?? 0)).slice(0, 30)
  const movsRecientes = [...movs].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")).slice(0, 15)

  const card = "bg-white rounded-2xl border border-gray-100 shadow-sm"

  function TablaCitas({ lista, vacio }: { lista: Cita[]; vacio: string }) {
    if (!lista.length) return <p className="px-5 py-8 text-center text-sm text-gray-400">{vacio}</p>
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-50">
            {lista.map(c => {
              const est = ESTADO[c.estado ?? ""] ?? { label: c.estado ?? "—", cls: "bg-gray-100 text-gray-600" }
              return (
                <tr key={c.id}>
                  <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{fechaCorta(c.fecha)} · {c.hora ?? "—"}</td>
                  <td className="px-3 py-2.5 text-gray-800 font-medium">{cliMap.get(c.clienteId ?? "")?.nombre ?? "—"}</td>
                  <td className="px-3 py-2.5 text-gray-500">{svcMap.get(c.servicioId ?? "")?.nombre ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${est.cls}`}>{est.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">

      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <Link href="/admin/leads" className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors mt-0.5">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{data.negocio || lead.negocio}</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
              <Eye size={12} /> Solo lectura
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{lead.nombre}{lead.tipo ? ` · ${lead.tipo}` : ""}</span>
            {lead.whatsapp && <span className="inline-flex items-center gap-1"><MessageCircle size={12} />{lead.whatsapp}</span>}
            {lead.email && <span className="inline-flex items-center gap-1"><Mail size={12} />{lead.email}</span>}
          </p>
          {respaldo && (
            <p className="text-xs text-gray-400 mt-1">
              Último respaldo {timeAgo(respaldo.ultimaActividad)} · agenda creada {timeAgo(respaldo.createdAt)}
            </p>
          )}
        </div>
      </div>

      {!respaldo ? (
        <div className={`${card} p-10 text-center`}>
          <CloudOff size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-700 font-medium">Todavía no hay respaldo de esta agenda</p>
          <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
            Aparece cuando la persona abre su agenda después de la actualización y acepta el respaldo en la nube.
            Si nunca vuelve a abrirla, sus datos solo existen en su navegador.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              { icon: <Users size={14} />,         label: "Clientes",        value: String(clientes.length) },
              { icon: <Scissors size={14} />,      label: "Servicios",       value: String(servicios.length) },
              { icon: <CalendarDays size={14} />,  label: "Citas totales",   value: String(citas.length), sub: `${citasMes} este mes` },
              { icon: <CalendarClock size={14} />, label: "Próximas",        value: String(citas.filter(c => (c.fecha ?? "") >= hoy && c.estado !== "cancelada").length) },
              { icon: <TrendingUp size={14} />,    label: "Ingresos (mes)",  value: clp(ingMes) },
              { icon: <TrendingDown size={14} />,  label: "Egresos (mes)",   value: clp(egrMes) },
            ].map(k => (
              <div key={k.label} className={`${card} p-4`}>
                <div className="flex items-center gap-1.5 text-gray-400 mb-1.5">
                  {k.icon}<span className="text-xs font-semibold uppercase tracking-wide">{k.label}</span>
                </div>
                <p className="text-lg font-bold text-gray-900">{k.value}</p>
                {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>

          {/* Perfil */}
          {(data.perfil?.titular || data.perfil?.telefono || data.perfil?.email) && (
            <div className={`${card} px-5 py-3 text-sm text-gray-600 flex flex-wrap gap-x-6 gap-y-1`}>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Perfil</span>
              {data.perfil?.titular && <span>{data.perfil.titular}</span>}
              {data.perfil?.telefono && <span>{data.perfil.telefono}</span>}
              {data.perfil?.email && <span>{data.perfil.email}</span>}
            </div>
          )}

          {/* Citas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}>
              <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-800">Próximas citas</h2>
              <TablaCitas lista={proximas} vacio="No tiene citas próximas agendadas" />
            </div>
            <div className={card}>
              <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-800">Citas recientes</h2>
              <TablaCitas lista={recientes} vacio="Aún no tiene citas pasadas" />
            </div>
          </div>

          {/* Clientes y servicios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={card}>
              <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-800">
                Clientes <span className="font-normal text-gray-400">({clientes.length})</span>
              </h2>
              {topClientes.length ? (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {topClientes.map(c => (
                      <tr key={c.id}>
                        <td className="px-5 py-2.5 text-gray-800 font-medium">{c.nombre || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-500">{c.telefono || "—"}</td>
                        <td className="px-5 py-2.5 text-right text-xs text-gray-400">{citasPorCliente.get(c.id) ?? 0} citas</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="px-5 py-8 text-center text-sm text-gray-400">No ha cargado clientes</p>}
              {clientes.length > topClientes.length && (
                <p className="px-5 py-2 text-xs text-gray-400 border-t border-gray-50">Mostrando los {topClientes.length} con más citas</p>
              )}
            </div>

            <div className={card}>
              <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-800">
                Servicios <span className="font-normal text-gray-400">({servicios.length})</span>
              </h2>
              {servicios.length ? (
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {servicios.map(s => (
                      <tr key={s.id}>
                        <td className="px-5 py-2.5 text-gray-800 font-medium">{s.nombre || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-500">{s.duracion ? `${s.duracion} min` : "—"}</td>
                        <td className="px-5 py-2.5 text-right text-gray-700">{clp(Number(s.precio) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="px-5 py-8 text-center text-sm text-gray-400">No ha cargado servicios</p>}
            </div>
          </div>

          {/* Finanzas */}
          <div className={card}>
            <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-gray-800">
              Movimientos recientes <span className="font-normal text-gray-400">({movs.length} en total)</span>
            </h2>
            {movsRecientes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {movsRecientes.map(m => (
                      <tr key={m.id}>
                        <td className="px-5 py-2.5 text-gray-600 whitespace-nowrap">{fechaCorta(m.fecha)}</td>
                        <td className="px-3 py-2.5 text-gray-800">{m.categoria || "—"}</td>
                        <td className="px-3 py-2.5 text-gray-500">{m.nota || ""}</td>
                        <td className={`px-5 py-2.5 text-right font-semibold whitespace-nowrap ${m.tipo === "egreso" ? "text-rose-500" : "text-emerald-600"}`}>
                          {m.tipo === "egreso" ? "−" : "+"}{clp(Number(m.monto) || 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 py-8 text-center text-sm text-gray-400">No ha registrado movimientos</p>}
          </div>
        </>
      )}
    </div>
  )
}
