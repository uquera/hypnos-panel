"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, Search, Users, Smartphone } from "lucide-react"

interface Cuenta {
  id: string; codigo: string; nombre: string; posUrl: string; activo: boolean
  logoUrl: string | null; cliente: string | null; usuarios: number; colorPrimario: string
}

function Logo({ c, size = 40 }: { c: Cuenta; size?: number }) {
  return c.logoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={c.logoUrl} alt="" width={size} height={size} className="rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 shrink-0" style={{ width: size, height: size }} />
    : <div className="rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ width: size, height: size, background: c.colorPrimario }}>{c.nombre.charAt(0)}</div>
}

function Estado({ activo }: { activo: boolean }) {
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${activo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      {activo ? "Activa" : "Suspendida"}
    </span>
  )
}

const host = (u: string) => { try { return new URL(u).host + new URL(u).pathname.replace(/\/$/, "") } catch { return u } }

export default function PosCuentasClient({ cuentas }: { cuentas: Cuenta[] }) {
  const [q, setQ] = useState("")
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return cuentas
    return cuentas.filter(c => [c.nombre, c.codigo, c.posUrl, c.cliente ?? ""].some(v => v.toLowerCase().includes(t)))
  }, [q, cuentas])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, código o link"
          className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
      </div>

      {lista.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <Smartphone size={28} className="mx-auto text-gray-300" />
          <p className="text-sm text-gray-500 mt-2">{cuentas.length ? "Ninguna cuenta coincide con la búsqueda." : "Aún no hay cuentas de Hypnos POS."}</p>
        </div>
      )}

      {/* Cards — móvil */}
      <div className="sm:hidden space-y-3">
        {lista.map(c => (
          <Link key={c.id} href={`/admin/pos/${c.id}`}
            className={`block bg-white rounded-xl border border-gray-100 shadow-sm p-4 ${!c.activo ? "opacity-70" : ""}`}>
            <div className="flex items-center gap-3">
              <Logo c={c} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{c.nombre}</p>
                <p className="text-xs text-gray-500 font-mono">{c.codigo}</p>
              </div>
              <Estado activo={c.activo} />
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
              <span className="truncate mr-2">{host(c.posUrl)}</span>
              <span className="inline-flex items-center gap-1 shrink-0"><Users size={12} /> {c.usuarios}</span>
            </div>
          </Link>
        ))}
      </div>

      {/* Tabla — tablet y desktop */}
      {lista.length > 0 && (
        <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Negocio</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Código</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Link</th>
                <th className="text-center px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Sub-cuentas</th>
                <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lista.map(c => (
                <tr key={c.id} className={`transition-colors hover:bg-gray-50/50 ${!c.activo ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3">
                    <Link href={`/admin/pos/${c.id}`} className="flex items-center gap-3 group">
                      <Logo c={c} size={36} />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 group-hover:text-indigo-600 truncate">{c.nombre}</p>
                        {c.cliente && <p className="text-xs text-gray-400 truncate">{c.cliente}</p>}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-700">{c.codigo}</td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <a href={c.posUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gray-500 hover:text-indigo-600 truncate max-w-full">
                      <span className="truncate">{host(c.posUrl)}</span> <ExternalLink size={12} className="shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{c.usuarios}</td>
                  <td className="px-4 py-3"><Estado activo={c.activo} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
