"use client"

import { useState } from "react"
import { CreditCard, Plus, Trash2 } from "lucide-react"

type Fila = { monto: string; url: string }
const MONTOS_BASE = ["20000", "40000", "45000"]

/**
 * Links de cobro TUU, uno por monto mensual. Cada restaurante ve el de su precio
 * ("Pagar con tarjeta") en el portal de pago y en los correos de cobro.
 */
export default function LinksPago({ inicial, enUso }: { inicial: Record<string, string>; enUso: Record<string, number> }) {
  const base = Array.from(new Set([...MONTOS_BASE, ...Object.keys(inicial)])).sort((a, b) => Number(a) - Number(b))
  const [filas, setFilas] = useState<Fila[]>(base.map(m => ({ monto: m, url: inicial[m] ?? "" })))
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

  const sinLink = Object.entries(enUso).filter(([m]) => !filas.some(f => f.monto === m && f.url))

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><CreditCard size={17} className="text-indigo-600" /> Cobro con tarjeta (TUU)</h2>
        <p className="text-sm text-gray-500">
          Pega el <b>Link de pago</b> de Haulmer de cada monto. Cada restaurante ve el de su precio mensual como «Pagar con tarjeta o Webpay»
          en su portal y en los correos de cobro. El pago se confirma igual que la transferencia: el cliente sube el comprobante y tú lo apruebas.
        </p>
      </div>
      <div className="space-y-2">
        {filas.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
              <input value={f.monto ? Number(f.monto).toLocaleString("es-CL") : ""} onChange={e => set(i, { monto: e.target.value.replace(/[^\d]/g, "") })}
                inputMode="numeric" placeholder="Monto" className="h-10 w-32 rounded-xl border border-gray-200 pl-6 pr-2 text-sm" />
            </div>
            <input value={f.url} onChange={e => set(i, { url: e.target.value })} placeholder="https://… (Link de pago de Haulmer)"
              className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 px-3 text-sm" />
            <span className="w-28 text-xs text-gray-400">{enUso[f.monto] ? `${enUso[f.monto]} restaurante${enUso[f.monto] === 1 ? "" : "s"}` : ""}</span>
            <button onClick={() => setFilas(fs => fs.filter((_, j) => j !== i))} title="Quitar" className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-red-500"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      {sinLink.length > 0 && (
        <p className="text-xs text-amber-700">Sin link para: {sinLink.map(([m, n]) => `$${Number(m).toLocaleString("es-CL")} (${n})`).join(", ")} — esos restaurantes solo ven transferencia.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setFilas(fs => [...fs, { monto: "", url: "" }])} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600"><Plus size={15} /> Otro monto</button>
        <button onClick={guardar} disabled={busy} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "Guardando…" : "Guardar links"}</button>
      </div>
      {msg && <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{msg.texto}</p>}
    </section>
  )
}
