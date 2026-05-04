import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { calcularEstado } from "@/lib/licencia-utils"
import { PlusCircle, ExternalLink, Edit2, Users, TrendingUp, Wallet, AlertTriangle, XCircle } from "lucide-react"
import RenovarButton from "./_components/RenovarButton"
import HealthMonitor from "./_components/HealthMonitor"

export const metadata = { title: "Clientes — Hypnos Panel" }
export const dynamic = "force-dynamic"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60)  return "ahora"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)  return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)    return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1)    return "hace 1 día"
  if (days < 7)      return `hace ${days} días`
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" })
}

const ACCION_LABEL: Record<string, string> = {
  LICENCIA_SYNC:     "sincronizó licencia de",
  PAGO_REGISTRADO:   "registró pago de",
  RENOVACION:        "renovó licencia de",
  CLIENTE_CREADO:    "creó el cliente",
  CLIENTE_ARCHIVADO: "archivó el cliente",
}

function formatUSD(monto: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(monto)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  await auth()

  const now             = new Date()
  const primerDiaMes    = new Date(now.getFullYear(), now.getMonth(), 1)
  const primerDiaSigMes = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  // Convierte cualquier pago a USD (1 USD = 1000 CLP)
  function toUSD(monto: number, moneda: string): number {
    if (moneda === "USD") return monto
    if (moneda === "CLP") return monto / 1000
    return monto
  }

  const [clientes, pagosMes, pagosTotal, actividadReciente] = await Promise.all([
    prisma.cliente.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    // Pagos del mes actual (todos los pagos, convertir a USD luego)
    prisma.pago.findMany({
      where: { fechaPago: { gte: primerDiaMes, lt: primerDiaSigMes } },
      select: { monto: true, moneda: true },
    }),
    // Todos los pagos históricos
    prisma.pago.findMany({
      select: { monto: true, moneda: true },
    }),
    // Últimas 10 acciones
    prisma.actividadLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ])

  const mrr            = pagosMes.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
  const totalHistorico = pagosTotal.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)

  const porVencer = clientes.filter((c) => {
    const dias = Math.ceil((new Date(c.fechaVencimiento).getTime() - now.getTime()) / 86_400_000)
    return !c.suspendida && dias > 0 && dias <= 30
  }).length

  const problemas = clientes.filter(
    (c) => c.suspendida || new Date(c.fechaVencimiento) <= now
  ).length

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5 hidden sm:block">Gestión de licencias SaaS</p>
        </div>
        <Link
          href="/admin/clientes/nuevo"
          className="inline-flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 shadow-sm shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
        >
          <PlusCircle size={16} />
          <span className="hidden sm:inline">Nuevo cliente</span>
          <span className="sm:hidden">Nuevo</span>
        </Link>
      </div>

      {/* Stats — 4 tarjetas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wallet size={14} className="text-indigo-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ingresos mes</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatUSD(mrr)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USD · {now.toLocaleDateString("es-CL", { month: "long" })}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-indigo-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total histórico</p>
          </div>
          <p className="text-xl font-bold text-gray-900">{formatUSD(totalHistorico)}</p>
          <p className="text-xs text-gray-400 mt-0.5">USD acumulado</p>
        </div>

        <div className="bg-white rounded-xl border border-amber-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Por vencer</p>
          </div>
          <p className="text-xl font-bold text-amber-600">{porVencer}</p>
          <p className="text-xs text-gray-400 mt-0.5">próximos 30 días</p>
        </div>

        <div className="bg-white rounded-xl border border-red-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle size={14} className="text-red-500" />
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencidos</p>
          </div>
          <p className="text-xl font-bold text-red-600">{problemas}</p>
          <p className="text-xs text-gray-400 mt-0.5">suspendidos o expirados</p>
        </div>
      </div>

      {/* Health Monitor */}
      <HealthMonitor clientes={clientes.map(c => ({
        id:            c.id,
        nombre:        c.nombre,
        ultimoCheck:   c.ultimoCheck?.toISOString() ?? null,
        ultimoCheckOk: c.ultimoCheckOk,
      }))} />

      {/* Lista de clientes */}
      {clientes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Users size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No hay clientes registrados</p>
          <p className="text-sm text-gray-400 mt-1">Agrega tu primer cliente con el botón de arriba</p>
        </div>
      ) : (
        <>
          {/* Cards — móvil (< sm) */}
          <div className="sm:hidden space-y-3">
            {clientes.map((c) => {
              const estado = calcularEstado(c)
              const fecha  = new Date(c.fechaVencimiento).toLocaleDateString("es-CL", {
                day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
              })
              return (
                <div key={c.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.nombre}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{c.dominio}</p>
                    </div>
                    <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${estado.color} ${estado.textColor}`}>
                      {estado.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">
                      {c.plan}
                    </span>
                    <span className="text-xs text-gray-500">{fecha}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                    <RenovarButton clienteId={c.id} clienteNombre={c.nombre} />
                    <Link
                      href={`/admin/clientes/${c.id}`}
                      className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                    >
                      <Edit2 size={13} /> Editar
                    </Link>
                    <a
                      href={`https://${c.dominio}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-9 px-3 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tabla — tablet y desktop (>= sm) */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Cliente</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Plan</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Vencimiento</th>
                  <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Estado</th>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {clientes.map((c) => {
                  const estado = calcularEstado(c)
                  const fecha  = new Date(c.fechaVencimiento).toLocaleDateString("es-CL", {
                    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
                  })
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">{c.nombre}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{c.dominio}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">
                          {c.plan}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600">{fecha}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${estado.color} ${estado.textColor}`}>
                          {estado.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={`https://${c.dominio}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            title="Ver sitio"
                          >
                            <ExternalLink size={15} />
                          </a>
                          <RenovarButton clienteId={c.id} clienteNombre={c.nombre} />
                          <Link
                            href={`/admin/clientes/${c.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                          >
                            <Edit2 size={12} />
                            Editar
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Log de actividad reciente */}
      {actividadReciente.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Actividad reciente</h2>
          <div className="space-y-3.5">
            {actividadReciente.map((log) => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {log.usuarioNombre.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-700 leading-snug">
                    <span className="font-semibold">{log.usuarioNombre}</span>
                    {" "}
                    <span className="text-gray-500">{ACCION_LABEL[log.accion] ?? log.accion}</span>
                    {log.clienteNombre && (
                      <span className="font-medium text-gray-800"> {log.clienteNombre}</span>
                    )}
                  </p>
                  {log.detalle && (
                    <p className="text-xs text-gray-400 mt-0.5">{log.detalle}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(log.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
