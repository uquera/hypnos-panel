import { prisma } from "@/lib/prisma"
import { tokenReciboValido, medioDePago } from "@/lib/pos/instancia"
import { formatoCLP, CORREO_CONTACTO } from "@/lib/pos/config"
import { fechaLarga } from "@/lib/pos/fechas"
import { IsotipoMi } from "../../_components/MarcaMi"
import BotonImprimir from "./BotonImprimir"

export const metadata = { title: "Comprobante de pago — Hypnos POS", robots: { index: false } }
export const dynamic = "force-dynamic"

// Comprobante de un pago de Hypnos POS (link firmado del historial de «Mi suscripción» del POS).
// Sin sesión: el token HMAC del link es la autorización. Solo pagos de cuentas de Hypnos POS.
export default async function ReciboPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params
  const { t = "" } = await searchParams
  const pago = tokenReciboValido(id, t)
    ? await prisma.pago.findUnique({ where: { id }, include: { cliente: { select: { nombre: true, posCuentas: { select: { nombre: true, rut: true, razonSocial: true }, take: 1 } } } } })
    : null
  const cuenta = pago?.cliente.posCuentas[0]

  if (!pago || !cuenta) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-sm text-gray-600">Este comprobante no existe o el link no es válido. Escríbenos a {CORREO_CONTACTO}.</p>
      </main>
    )
  }

  const monto = pago.moneda === "CLP" ? formatoCLP(pago.monto) : `${pago.moneda} ${pago.monto}`
  const fila = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-6 border-b border-gray-100 py-2 text-sm"><span className="text-gray-500">{k}</span><span className="text-right font-medium text-gray-900">{v}</span></div>
  )
  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex items-center gap-3">
          <IsotipoMi size={40} />
          <div>
            <p className="font-bold text-gray-900">Hypnos SpA</p>
            <p className="text-xs text-gray-500">hypnosapps.com · {CORREO_CONTACTO}</p>
          </div>
        </div>
        <h1 className="mt-6 text-xl font-bold text-gray-900">Comprobante de pago</h1>
        <p className="text-xs text-gray-500">N.º {pago.id}</p>
        <div className="mt-5">
          {fila("Cliente", cuenta.razonSocial || cuenta.nombre)}
          {cuenta.rut && fila("RUT", cuenta.rut)}
          {fila("Fecha de pago", fechaLarga(pago.fechaPago))}
          {fila("Concepto", pago.concepto === "LICENCIA" ? "Suscripción Hypnos POS" : pago.conceptoDetalle || pago.concepto)}
          {pago.periodoInicio && pago.periodoFin && fila("Período", `${fechaLarga(pago.periodoInicio)} al ${fechaLarga(pago.periodoFin)}`)}
          {fila("Medio de pago", medioDePago(pago.notas, pago.comprobante))}
          {fila("Estado", <span className="text-green-700">Pagado</span>)}
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-sm text-gray-500">Total pagado (IVA incluido)</span>
          <span className="text-2xl font-bold text-gray-900">{monto}</span>
        </div>
        <p className="mt-6 text-[11px] leading-relaxed text-gray-400">
          Este comprobante acredita el pago de tu suscripción a Hypnos POS. No es una boleta ni una factura electrónica: si la necesitas, escríbenos a {CORREO_CONTACTO}.
        </p>
        <BotonImprimir />
      </div>
    </main>
  )
}
