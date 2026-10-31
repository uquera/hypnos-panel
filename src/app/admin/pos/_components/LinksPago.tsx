"use client"

import { useState } from "react"
import { CreditCard, Plus, Trash2 } from "lucide-react"

type Fila = { precio: string; meses: string; monto: string; url: string }
export type LinkPagoFila = { precio: number; meses: number; monto: number; url: string }

// Opciones de siempre (planes de 20, 40 y 45 mil, y el anual del plan de 20 mil)
const BASE: Fila[] = [
  { precio: "20000", meses: "1", monto: "20000", url: "" },
  { precio: "40000", meses: "1", monto: "40000", url: "" },
  { precio: "45000", meses: "1", monto: "45000", url: "" },
  { precio: "20000", meses: "12", monto: "200000", url: "" },
]

const clp = (v: string) => (v ? Number(v).toLocaleString("es-CL") : "")
const input = "h-10 rounded-xl border border-gray-200 px-2 text-sm"

/**
 * Links de cobro TUU por plan. Cada restaurante ve las opciones de su precio mensual
 * («Pagar con tarjeta», y «Pagar el año» si su plan tiene anual) en el portal y en los correos.
 */
export default function LinksPago({ inicial, enUso }: { inicial: LinkPagoFila[]; enUso: Record<string, number> }) {
  const desdeServidor: Fila[] = inicial.map(l => ({ precio: String(l.precio), meses: String(l.meses), monto: String(l.monto), url: l.url }))
  const faltan = BASE.filter(b => !desdeServidor.some(s => s.precio === b.precio && s.meses === b.meses))
  const [filas, setFilas] = useState<Fila[]>([...desdeServidor, ...faltan].sort((a, b) => Number(a.meses) - Number(b.meses) || Number(a.precio) - Number(b.precio)))
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (i: number, p: Partial<Fila>) => setFilas(fs => fs.map((f, j) => (j === i ? { ...f, ...p } : f)))

  async function guardar() {
    setBusy(true); setMsg(null)
    const r = await fetch("/api/pos-admin/links-pago", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filas }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    setMsg(r.ok ? { ok: true, texto: "Links guardados. Ya aparecen en el portal de pago y en los próximos correos de cobro." } : { ok: false, texto: j.error ?? "No se pudo guardar" })
  }

  const sinLink = Object.entries(enUso).filter(([p]) => !filas.some(f => f.precio === p && f.meses === "1" && f.url))

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><CreditCard size={17} className="text-indigo-600" /> Cobro con tarjeta (TUU)</h2>
        <p className="text-sm text-gray-500">
          Pega el <b>Link de pago</b> de Haulmer de cada opción. Cada restaurante ve las de su <b>plan</b> (su precio mensual) en el portal y en los correos de cobro.
          El pago se confirma como la transferencia: el cliente sube el comprobante y, al aprobarlo, se sugieren los meses de la opción pagada (anual = 12).
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-2">
          <div className="grid grid-cols-[110px_90px_120px_1fr_90px_36px] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <span>Plan (mensual)</span><span>Meses</span><span>Monto</span><span>Link de Haulmer</span><span /><span />
          </div>
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-[110px_90px_120px_1fr_90px_36px] items-center gap-2">
              <input value={clp(f.precio)} onChange={e => set(i, { precio: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="20.000" className={input} />
              <select value={f.meses} onChange={e => set(i, { meses: e.target.value })} className={`${input} bg-white`}>
                <option value="1">1 mes</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">12 meses</option>
              </select>
              <input value={clp(f.monto)} onChange={e => set(i, { monto: e.target.value.replace(/[^\d]/g, "") })} inputMode="numeric" placeholder="Monto" className={input} />
              <input value={f.url} onChange={e => set(i, { url: e.target.value })} placeholder="https://www.tuu.cl/…" className={`${input} min-w-0 px-3`} />
              <span className="text-xs text-gray-400">{f.meses === "1" && enUso[f.precio] ? `${enUso[f.precio]} local${enUso[f.precio] === 1 ? "" : "es"}` : ""}</span>
              <button onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} title="Quitar" className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-red-500"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </div>
      {sinLink.length > 0 && (
        <p className="text-xs text-amber-700">Sin link mensual para: {sinLink.map(([p, n]) => `$${clp(p)} (${n})`).join(", ")} — esos restaurantes solo ven transferencia.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setFilas(fs => [...fs, { precio: "", meses: "1", monto: "", url: "" }])} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><Plus size={15} /> Otra opción</button>
        <button onClick={guardar} disabled={busy} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "Guardando…" : "Guardar links"}</button>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.texto}</p>}
    </section>
  )
}
