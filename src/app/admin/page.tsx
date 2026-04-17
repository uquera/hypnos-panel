import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { calcularEstado } from "@/lib/licencia-utils"
import { PlusCircle, ExternalLink, Edit2, Users } from "lucide-react"

export const metadata = { title: "Clientes — Hypnos Panel" }
export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const session  = await auth()
  const clientes = await prisma.cliente.findMany({
    where:   { activo: true },
    orderBy: { nombre: "asc" },
  })

  const total       = clientes.length
  const suspendidos = clientes.filter(c => c.suspendida || new Date(c.fechaVencimiento) <= new Date()).length
  const porVencer   = clientes.filter(c => {
    const dias = Math.ceil((new Date(c.fechaVencimiento).getTime() - Date.now()) / 86_400_000)
    return !c.suspendida && dias > 0 && dias <= 7
  }).length

  return (
    <div className="max-w-5xl space-y-5">

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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total",       value: total,       color: "text-gray-900" },
          { label: "Por vencer",  value: porVencer,   color: "text-amber-600" },
          { label: "Suspendidos", value: suspendidos, color: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 sm:p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{s.label}</p>
            <p className={`text-2xl sm:text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Contenido */}
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
                day: "numeric", month: "short", year: "numeric",
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
                    day: "numeric", month: "short", year: "numeric",
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
    </div>
  )
}
