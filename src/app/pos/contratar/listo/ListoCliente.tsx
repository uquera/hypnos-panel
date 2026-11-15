"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, ChefHat, Clock, CreditCard, ExternalLink, Loader2, Package, CalendarDays, Mail } from "lucide-react"
import { clp } from "@/lib/pos/contratar-calculo"

const NARANJA = "#f26522"
const WA = "https://wa.me/56933688302"

type Estado = {
  estado: string; medio: string; total: number; plan: string; maquinas: number; marcha: boolean; mpListo: boolean; revision: boolean
  detalle: string | null; transferencia: string | null
  cuenta: { id: string; token: string; nombre: string; codigo: string; estadoAlta: string; url: string | null; enPrueba: boolean; vence: string | null }
}

export default function ListoCliente({ pedido, token, fallo }: { pedido: string; token: string; fallo: boolean }) {
  const [d, setD] = useState<Estado | null>(null)
  const [error, setError] = useState(!pedido || !token ? "El link no es válido." : "")
  const [pagando, setPagando] = useState(false)

  useEffect(() => {
    if (!pedido || !token) return
    let vivo = true
    const tick = async () => {
      try {
        const r = await fetch(`/api/pos-registro/pedido?p=${encodeURIComponent(pedido)}&t=${encodeURIComponent(token)}`, { cache: "no-store" })
        if (!vivo) return
        if (r.status === 404) { setError("No encontramos tu pedido."); return }
        setD(await r.json())
      } catch { /* reintenta en el próximo ciclo */ }
    }
    tick()
    const iv = setInterval(tick, 4000)
    return () => { vivo = false; clearInterval(iv) }
  }, [pedido, token])

  async function pagar() {
    setPagando(true)
    try {
      const r = await fetch(`/api/pos-registro/pedido?p=${encodeURIComponent(pedido)}&t=${encodeURIComponent(token)}`, { method: "POST" })
      const j = await r.json()
      if (r.ok && j.url) window.location.href = j.url
      else setError(j.error ?? "No pudimos abrir Mercado Pago.")
    } catch { setError("Sin conexión.") } finally { setPagando(false) }
  }

  const instalando = d && d.cuenta.estadoAlta !== "LISTO" && d.cuenta.estadoAlta !== "ERROR"
  const pagado = d?.estado === "PAGADO"
  const pendienteMp = d?.estado === "PENDIENTE" && d.medio === "MERCADOPAGO" && !d.revision
  const noPago = fallo || !!d?.detalle
  const vence = d?.cuenta.vence ? new Date(d.cuenta.vence).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }) : ""

  return (
    <div className="min-h-screen bg-[#fff7f2]">
      <header className="bg-gray-950 text-white">
        <div className="max-w-xl mx-auto px-5 pt-6 pb-24 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: NARANJA }}><ChefHat size={20} /></div>
          <span className="font-bold tracking-tight text-lg">Hypnos <span style={{ color: NARANJA }}>POS</span></span>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 -mt-16 pb-16">
        <div className="bg-white rounded-3xl shadow-xl shadow-orange-900/5 border border-orange-100 p-6 sm:p-8">
          {error && !d && (
            <div className="text-center py-6">
              <AlertTriangle size={44} className="mx-auto text-amber-500" />
              <p className="mt-3 font-semibold text-gray-900">{error}</p>
              <a href={WA} className="mt-5 inline-block underline text-sm">Escríbenos por WhatsApp</a>
            </div>
          )}
          {!d && !error && <div className="py-12 flex justify-center"><Loader2 className="animate-spin" style={{ color: NARANJA }} /></div>}

          {d && (
            <>
              {pagado && (
                <div className="text-center">
                  <CheckCircle2 size={54} className="mx-auto text-green-500" />
                  <h1 className="mt-3 text-2xl font-extrabold text-gray-900">¡Pago recibido!</h1>
                  <p className="mt-1 text-sm text-gray-500">{clp(d.total)} · tu plan {d.plan === "ANUAL" ? "anual" : "mensual"} está activo{vence ? ` hasta el ${vence}` : ""}.</p>
                </div>
              )}
              {d.estado === "SIN_PAGO" && (
                <div className="text-center">
                  <div className="text-5xl">🎉</div>
                  <h1 className="mt-3 text-2xl font-extrabold text-gray-900">¡Bienvenido a Hypnos POS!</h1>
                  <p className="mt-1 text-sm text-gray-500">Tu prueba gratis {vence ? `dura hasta el ${vence}` : "ya comenzó"}. No pagas nada hoy.</p>
                </div>
              )}
              {pendienteMp && (
                <div className="text-center">
                  {noPago ? <AlertTriangle size={48} className="mx-auto text-amber-500" /> : <Clock size={48} className="mx-auto text-amber-500" />}
                  <h1 className="mt-3 text-2xl font-extrabold text-gray-900">{noPago ? "El pago no se completó" : "Esperando la confirmación del pago"}</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {noPago ? "No se cobró nada. Tu sistema igual se está creando en modo prueba." : "Si ya pagaste, Mercado Pago nos avisa en segundos. Esta página se actualiza sola."}
                  </p>
                  <button onClick={pagar} disabled={pagando} className="mt-4 w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style={{ background: "#009ee3" }}>
                    {pagando ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />} {noPago ? "Intentar de nuevo" : "Ir a pagar"} {clp(d.total)}
                  </button>
                  {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
                </div>
              )}
              {d.estado === "PENDIENTE" && d.medio === "TRANSFERENCIA" && (
                <div>
                  <h1 className="text-2xl font-extrabold text-gray-900 text-center">Falta tu transferencia</h1>
                  <p className="mt-1 text-sm text-gray-500 text-center">Transfiere <strong>{clp(d.total)}</strong> y sube el comprobante en Mi Hypnos → Pago. Mientras tanto tu sistema funciona en modo prueba.</p>
                  {d.transferencia && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-800 font-sans">{d.transferencia}</pre>}
                  {d.mpListo && <button onClick={pagar} disabled={pagando} className="mt-3 w-full text-sm underline text-gray-500">Prefiero pagar con Mercado Pago</button>}
                  {error && <p className="mt-2 text-sm text-red-600 text-center">{error}</p>}
                </div>
              )}
              {(d.estado === "ERROR" || d.estado === "RECHAZADO" || d.revision) && (
                <div className="text-center">
                  <AlertTriangle size={48} className="mx-auto text-amber-500" />
                  <h1 className="mt-3 text-xl font-bold text-gray-900">Recibimos tu pago y lo estamos revisando</h1>
                  <p className="mt-1 text-sm text-gray-500">Nuestro equipo ya fue avisado y te escribirá hoy mismo.</p>
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-gray-100 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tu sistema</p>
                <p className="mt-1 font-mono text-sm font-semibold" style={{ color: NARANJA }}>{d.cuenta.codigo}.hypnosapps.com</p>
                {instalando && (
                  <>
                    <p className="mt-2 text-sm text-gray-600 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Instalando {d.cuenta.nombre}… suele tardar 1 a 3 minutos.</p>
                    <div className="mt-3 h-2 rounded-full bg-orange-100 overflow-hidden"><div className="h-full w-1/3 rounded-full animate-[progreso_1.6s_ease-in-out_infinite]" style={{ background: NARANJA }} /></div>
                    <style>{"@keyframes progreso{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}"}</style>
                  </>
                )}
                {d.cuenta.estadoAlta === "LISTO" && (
                  <a href={`/api/pos-registro/abrir?id=${encodeURIComponent(d.cuenta.id)}&t=${encodeURIComponent(d.cuenta.token)}`} target="_blank" rel="noopener"
                    className="mt-3 w-full h-12 rounded-xl text-white font-bold inline-flex items-center justify-center gap-2" style={{ background: NARANJA }}>
                    Abrir mi sistema <ExternalLink size={16} />
                  </a>
                )}
                {d.cuenta.estadoAlta === "ERROR" && <p className="mt-2 text-sm text-amber-700">Tuvimos un problema instalándolo. Ya estamos en eso y te escribiremos apenas esté listo.</p>}
              </div>

              <ul className="mt-5 space-y-2.5 text-sm text-gray-700">
                <li className="flex gap-2.5"><Mail size={17} className="shrink-0 mt-0.5 text-gray-400" /> Te enviamos un correo para crear tu contraseña de Mi Hypnos (tu sistema y tus pagos).</li>
                {d.marcha && <li className="flex gap-2.5"><CalendarDays size={17} className="shrink-0 mt-0.5 text-gray-400" /> {pagado ? "Te escribimos por WhatsApp para agendar la puesta en marcha." : "Agendamos tu puesta en marcha apenas se confirme el pago."}</li>}
                {d.maquinas > 0 && <li className="flex gap-2.5"><Package size={17} className="shrink-0 mt-0.5 text-gray-400" /> {pagado ? "Tu Point Smart 2 se despacha en 2 a 4 días hábiles." : "Despachamos tu Point Smart 2 cuando se confirme el pago."}</li>}
                {d.plan === "MENSUAL" && <li className="flex gap-2.5"><CreditCard size={17} className="shrink-0 mt-0.5 text-gray-400" /> En Mi Hypnos → Pago puedes activar el pago automático mensual y olvidarte de pagar.</li>}
              </ul>
              <p className="mt-6 text-center text-xs text-gray-400">¿Dudas? <a href={WA} target="_blank" rel="noreferrer" className="underline">WhatsApp +56 9 3368 8302</a></p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
