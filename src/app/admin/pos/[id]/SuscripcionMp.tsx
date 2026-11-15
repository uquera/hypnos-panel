"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, CreditCard, Loader2, RefreshCw } from "lucide-react"

// Ficha → pago automático mensual con Mercado Pago: estado, link para mandarle al dueño,
// revisar ahora y cancelar. El dueño también lo activa solo desde su portal (/pos/pago).

const ETIQUETA: Record<string, string> = {
  pending: "Esperando que el dueño autorice la tarjeta",
  authorized: "Activo: Mercado Pago cobra solo cada mes",
  paused: "En pausa en Mercado Pago",
  cancelled: "Cancelado",
}

export default function SuscripcionMp({ cuentaId, s, emailDueno, disponible }: {
  cuentaId: string
  s: { estado: string; monto: string; email: string; link: string; ultimoCobro: string | null; cobros: { fecha: string; monto: string; estado: string }[] } | null
  emailDueno: string
  disponible: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState(s?.email || emailDueno)
  const [ocupado, setOcupado] = useState(false)
  const url = `/api/pos-admin/cuentas/${cuentaId}/suscripcion`

  async function llamar(method: "POST" | "PUT" | "DELETE") {
    setOcupado(true)
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ email }) : undefined })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error ?? "Error con Mercado Pago"); return }
      if (method === "POST" && d.url) {
        await navigator.clipboard.writeText(d.url).catch(() => {})
        toast.success("Link copiado: mándaselo al dueño para que autorice su tarjeta.")
      } else if (method === "PUT") toast.success(d.registradas ? `${d.registradas} cobro(s) nuevo(s) registrados` : "Revisado: sin cobros nuevos")
      else if (method === "DELETE") toast.success("Pago automático cancelado")
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  if (!disponible) {
    return <p className="text-sm text-gray-500">Falta configurar <code>MP_ACCESS_TOKEN</code> en el servidor del panel.</p>
  }

  const vivo = s && s.estado !== "cancelled"
  return (
    <div className="space-y-3 text-sm">
      {vivo ? (
        <>
          <p className="font-semibold text-gray-900">{ETIQUETA[s.estado] ?? s.estado}</p>
          <p className="text-gray-600">{s.monto} al mes · {s.email}{s.ultimoCobro ? ` · último cobro ${s.ultimoCobro}` : ""}</p>
          <div className="flex flex-wrap gap-2">
            {s.estado === "pending" && s.link && (
              <button type="button" onClick={() => navigator.clipboard.writeText(s.link).then(() => toast.success("Link copiado"))}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                <Copy size={13} /> Copiar link para el dueño
              </button>
            )}
            <button type="button" onClick={() => llamar("PUT")} disabled={ocupado}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={13} /> Revisar ahora
            </button>
            <button type="button" onClick={() => { if (window.confirm("¿Cancelar el pago automático en Mercado Pago?")) llamar("DELETE") }} disabled={ocupado}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50">
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-56 text-xs font-semibold text-gray-500">
            Correo Mercado Pago del dueño
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 h-9 text-sm text-gray-900" />
          </label>
          <button type="button" onClick={() => llamar("POST")} disabled={ocupado || !email.includes("@")}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-bold bg-[#009ee3] text-white hover:bg-[#0089c7] disabled:opacity-50">
            {ocupado ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />} Crear link de pago automático
          </button>
        </div>
      )}
      {s && s.cobros.length > 0 && (
        <ul className="text-xs text-gray-500 space-y-0.5">
          {s.cobros.map((c, i) => <li key={i}>{c.fecha} · {c.monto} · {c.estado === "approved" ? "aprobado" : `rechazado (${c.estado})`}</li>)}
        </ul>
      )}
    </div>
  )
}
