import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, ExternalLink, Store } from "lucide-react"
import { requireSesionPos } from "@/lib/pos/sesion"
import { cadenaDe, MEDIO_LABEL, rangoFechas, resumenCadena, RANGOS, variacion, type Rango } from "@/lib/pos/cadena"

export const metadata = { title: "Mi cadena — Hypnos POS" }
export const dynamic = "force-dynamic"

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`
const fechaCorta = (dia: string) => {
  const [y, m, d] = dia.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "UTC" })
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  const v = variacion(actual, anterior)
  if (v === null) return <span className="text-xs text-gray-400">sin período anterior</span>
  const sube = v >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${sube ? "text-green-700" : "text-red-600"}`}>
      {sube ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(v)}% vs período anterior
    </span>
  )
}

// Vista consolidada para dueños con varios locales: cada local es un sistema aparte y aquí se suman.
export default async function MiCadenaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const yo = await requireSesionPos("/pos/cadena")
  const cadena = await cadenaDe(yo.email)
  if (!cadena) redirect("/pos/inicio")

  const sp = await searchParams
  const rango = (RANGOS.some((r) => r.id === sp.rango) ? sp.rango : "hoy") as Rango
  const f = rangoFechas(rango, sp.desde, sp.hasta)
  const { locales, total } = await resumenCadena(cadena, f.desde, f.hasta)
  const ok = locales.filter((l) => l.resumen)
  const caidos = locales.filter((l) => !l.resumen)
  const periodo = f.desdeDia === f.hastaDia ? fechaCorta(f.desdeDia) : `${fechaCorta(f.desdeDia)} al ${fechaCorta(f.hastaDia)}`
  const query = new URLSearchParams({ rango, ...(rango === "personalizado" ? { desde: f.desdeDia, hasta: f.hastaDia } : {}) })
  const canales = Object.keys(total.porCanal).sort((a, b) => total.porCanal[b].monto - total.porCanal[a].monto)
  const medios = Object.keys(total.porMedio).sort((a, b) => total.porMedio[b] - total.porMedio[a])
  const dias = Object.keys(total.porDia).sort()
  const maxDia = Math.max(1, ...dias.map((d) => total.porDia[d]))
  const card = "bg-white rounded-2xl border border-gray-100 shadow-sm"
  const th = "px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap"
  const td = "px-3 py-2 whitespace-nowrap"

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">Mi cadena</p>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{cadena.nombre}</h1>
          <p className="text-sm text-gray-500">{locales.length} locales · {periodo}</p>
        </div>
        <a href={`/api/pos-portal/cadena/excel?${query}`}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:opacity-90">
          <Download size={16} /> Exportar a Excel
        </a>
      </div>

      {/* Período */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGOS.filter((r) => r.id !== "personalizado").map((r) => (
          <Link key={r.id} href={`/pos/cadena?rango=${r.id}`}
            className={`h-9 px-3 rounded-lg text-sm font-medium inline-flex items-center ${rango === r.id ? "bg-[#f26522] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {r.label}
          </Link>
        ))}
        <form action="/pos/cadena" className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="rango" value="personalizado" />
          <input type="date" name="desde" defaultValue={f.desdeDia} className="h-9 rounded-lg border border-gray-200 px-2 text-sm" />
          <span className="text-gray-400 text-sm">a</span>
          <input type="date" name="hasta" defaultValue={f.hastaDia} className="h-9 rounded-lg border border-gray-200 px-2 text-sm" />
          <button className={`h-9 px-3 rounded-lg text-sm font-medium ${rango === "personalizado" ? "bg-[#f26522] text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>Ver</button>
        </form>
      </div>

      {caidos.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Sin datos de {caidos.map((l) => `${l.nombre} (${l.error})`).join(", ")}. Los totales incluyen solo los locales que respondieron.</span>
        </div>
      )}

      {/* Totales de la cadena */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { t: "Ventas", v: clp(total.ventas), extra: <Variacion actual={total.ventas} anterior={total.anterior.ventas} /> },
          { t: "Pedidos", v: total.pedidos.toLocaleString("es-CL"), extra: <Variacion actual={total.pedidos} anterior={total.anterior.pedidos} /> },
          { t: "Ticket promedio", v: clp(total.ticketPromedio), extra: <span className="text-xs text-gray-400">propinas {clp(total.propinas)}</span> },
          { t: "Gastos del período", v: clp(total.gastos), extra: <span className="text-xs text-gray-400">registrados en Gastos</span> },
        ].map((k) => (
          <div key={k.t} className={`${card} p-4`}>
            <p className="text-xs font-medium text-gray-500">{k.t}</p>
            <p className="mt-1 text-xl font-bold text-gray-900">{k.v}</p>
            <div className="mt-1">{k.extra}</div>
          </div>
        ))}
      </div>

      {/* Locales lado a lado */}
      <section className={card}>
        <h2 className="px-4 pt-4 font-bold text-gray-900">Locales</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Local</th><th className={`${th} text-right`}>Ventas</th><th className={`${th} text-right`}>Pedidos</th>
                <th className={`${th} text-right`}>Ticket</th><th className={th}>vs anterior</th><th className={`${th} text-right`}>% de la cadena</th>
                <th className={`${th} text-right`}>Gastos</th><th className={th}>Caja</th><th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {locales.map((l) => {
                const r = l.resumen
                return (
                  <tr key={l.cuentaId} className="border-t border-gray-100">
                    <td className={`${td} font-semibold text-gray-900`}><span className="inline-flex items-center gap-1.5"><Store size={14} className="text-gray-400" />{l.nombre}</span></td>
                    {r ? (
                      <>
                        <td className={`${td} text-right font-semibold`}>{clp(r.ventas)}</td>
                        <td className={`${td} text-right`}>{r.pedidos}</td>
                        <td className={`${td} text-right`}>{clp(r.ticketPromedio)}</td>
                        <td className={td}><Variacion actual={r.ventas} anterior={r.anterior.ventas} /></td>
                        <td className={`${td} text-right`}>{total.ventas ? Math.round((r.ventas / total.ventas) * 100) : 0}%</td>
                        <td className={`${td} text-right`}>{clp(r.gastos)}</td>
                        <td className={td}>
                          {r.cajasAbiertas.length
                            ? <span className="text-green-700 font-medium" title={r.cajasAbiertas.map((c) => `${c.caja}: ${c.usuario}`).join(" · ")}>Abierta</span>
                            : <span className="text-gray-400">Cerrada</span>}
                        </td>
                      </>
                    ) : (
                      <td className={`${td} text-amber-700`} colSpan={7}><AlertTriangle size={13} className="inline mr-1" />{l.error}</td>
                    )}
                    <td className={`${td} text-right`}>
                      <a href={`/api/pos-portal/abrir?cuenta=${l.cuentaId}`} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold text-white bg-[#f26522] hover:opacity-90">
                        Entrar <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                <td className={td}>Total cadena</td>
                <td className={`${td} text-right`}>{clp(total.ventas)}</td>
                <td className={`${td} text-right`}>{total.pedidos}</td>
                <td className={`${td} text-right`}>{clp(total.ticketPromedio)}</td>
                <td className={td}><Variacion actual={total.ventas} anterior={total.anterior.ventas} /></td>
                <td className={`${td} text-right`}>100%</td>
                <td className={`${td} text-right`}>{clp(total.gastos)}</td>
                <td className={td} colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Canales */}
        <section className={card}>
          <h2 className="px-4 pt-4 font-bold text-gray-900">Ventas por canal</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Canal</th>{ok.map((l) => <th key={l.cuentaId} className={`${th} text-right`}>{l.nombre}</th>)}<th className={`${th} text-right`}>Total</th></tr></thead>
              <tbody>
                {canales.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={ok.length + 2}>Sin ventas en el período.</td></tr>}
                {canales.map((c) => (
                  <tr key={c} className="border-t border-gray-100">
                    <td className={td}>{c}</td>
                    {ok.map((l) => <td key={l.cuentaId} className={`${td} text-right`}>{clp(l.resumen!.porCanal[c]?.monto ?? 0)}</td>)}
                    <td className={`${td} text-right font-semibold`}>{clp(total.porCanal[c].monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Medios de pago */}
        <section className={card}>
          <h2 className="px-4 pt-4 font-bold text-gray-900">Medios de pago</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className={th}>Medio</th>{ok.map((l) => <th key={l.cuentaId} className={`${th} text-right`}>{l.nombre}</th>)}<th className={`${th} text-right`}>Total</th></tr></thead>
              <tbody>
                {medios.length === 0 && <tr><td className={`${td} text-gray-400`} colSpan={ok.length + 2}>Sin ventas en el período.</td></tr>}
                {medios.map((m) => (
                  <tr key={m} className="border-t border-gray-100">
                    <td className={td}>{MEDIO_LABEL[m] ?? m}</td>
                    {ok.map((l) => <td key={l.cuentaId} className={`${td} text-right`}>{clp(l.resumen!.porMedio[m] ?? 0)}</td>)}
                    <td className={`${td} text-right font-semibold`}>{clp(total.porMedio[m])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Productos */}
        <section className={card}>
          <h2 className="px-4 pt-4 font-bold text-gray-900">Productos más vendidos <span className="font-normal text-gray-400 text-sm">(toda la cadena)</span></h2>
          <ol className="p-4 pt-2 space-y-1.5 text-sm">
            {total.topProductos.length === 0 && <li className="text-gray-400">Sin ventas en el período.</li>}
            {total.topProductos.map((p, i) => (
              <li key={p.nombre} className="flex items-center gap-2">
                <span className="w-5 text-right text-gray-400">{i + 1}.</span>
                <span className="flex-1 min-w-0 truncate text-gray-900">{p.nombre}</span>
                <span className="text-gray-500">{p.cantidad} u.</span>
                <span className="w-24 text-right font-semibold">{clp(p.monto)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Por día */}
        <section className={card}>
          <h2 className="px-4 pt-4 font-bold text-gray-900">Ventas por día</h2>
          <div className="p-4 pt-2 space-y-1.5 text-sm">
            {dias.length === 0 && <p className="text-gray-400">Sin ventas en el período.</p>}
            {dias.map((d) => (
              <div key={d} className="flex items-center gap-2">
                <span className="w-16 text-gray-500">{fechaCorta(d)}</span>
                <span className="flex-1 h-4 rounded bg-gray-100 overflow-hidden"><span className="block h-full bg-[#f26522]" style={{ width: `${(total.porDia[d] / maxDia) * 100}%` }} /></span>
                <span className="w-24 text-right font-semibold">{clp(total.porDia[d])}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="text-xs text-gray-500">
        Cada local sigue funcionando por separado (su caja, carta, máquina de pago y apps). Aquí solo se suman sus ventas; para entrar a un local usa «Entrar».
      </p>
    </div>
  )
}
