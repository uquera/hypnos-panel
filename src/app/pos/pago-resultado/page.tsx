import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { formatoCLP, CORREO_CONTACTO } from "@/lib/pos/config"
import { fechaLarga } from "@/lib/pos/fechas"
import PosAuthCard from "../_components/PosAuthCard"

export const metadata = { title: "Estado del pago — Hypnos POS" }
export const dynamic = "force-dynamic"

// Retorno desde TUU (x_url_complete / x_url_cancel). Solo MUESTRA el estado leyendo la base:
// el retorno del navegador no prueba ningún pago; lo confirma el callback firmado de TUU.
export default async function PagoResultadoPage({ searchParams }: { searchParams: Promise<{ ref?: string; cancelado?: string }> }) {
  const { ref = "", cancelado } = await searchParams
  const cobro = /^HP-\d{8}-[0-9A-F]{10}$/.test(ref)
    ? await prisma.posCobroOnline.findUnique({ where: { referencia: ref }, include: { cuenta: { select: { nombre: true } } } })
    : null

  if (!cobro) {
    return (
      <PosAuthCard titulo="Pago no encontrado" subtitulo="Hypnos POS">
        <p className="text-sm text-gray-600">No encontramos este pago. Si te cobraron, escríbenos a <a className="underline" href={`mailto:${CORREO_CONTACTO}`}>{CORREO_CONTACTO}</a>.</p>
        <Link href="/pos/pago" className="mt-4 block text-center text-sm font-semibold text-indigo-600">Ir a mi portal</Link>
      </PosAuthCard>
    )
  }

  const monto = formatoCLP(cobro.monto)
  const esperando = cobro.estado === "PENDIENTE" && !cancelado
  let titulo: string, texto: string, tono: string
  if (cobro.estado === "PAGADO") {
    titulo = "¡Pago recibido!"
    texto = cobro.hasta
      ? `Confirmamos tu pago de ${monto}. ${cobro.cuenta.nombre} está activo hasta el ${fechaLarga(cobro.hasta)}. Te enviamos el comprobante por correo.`
      : `Confirmamos tu pago de ${monto}. Estamos actualizando tu plan; en unos minutos lo verás en tu portal.`
    tono = "bg-green-50 border-green-200 text-green-800"
  } else if (cobro.estado === "ERROR") {
    titulo = "Pago recibido, en revisión"
    texto = `Recibimos tu pago de ${monto}, pero tu plan no se actualizó solo. Ya nos avisamos y lo dejaremos listo a la brevedad.`
    tono = "bg-amber-50 border-amber-200 text-amber-800"
  } else if (esperando) {
    titulo = "Confirmando tu pago…"
    texto = "Estamos esperando la confirmación de Webpay. Esta página se actualiza sola; no vuelvas a pagar."
    tono = "bg-gray-50 border-gray-200 text-gray-700"
  } else {
    titulo = "El pago no se completó"
    texto = "No se realizó ningún cobro. Puedes intentarlo de nuevo desde tu portal o pagar por transferencia."
    tono = "bg-red-50 border-red-200 text-red-800"
  }

  return (
    <PosAuthCard titulo={titulo} subtitulo={`Hypnos POS · ${cobro.cuenta.nombre}`}>
      {esperando && <meta httpEquiv="refresh" content="4" />}
      <div className={`rounded-xl border p-4 text-sm ${tono}`}>{texto}</div>
      <p className="mt-3 text-xs text-gray-400 text-center">Referencia {cobro.referencia}</p>
      <Link href="/pos/pago" className="mt-4 block text-center text-sm font-semibold text-indigo-600">Ir a mi portal</Link>
    </PosAuthCard>
  )
}
