import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { tuuOnlineEnabled } from "@/lib/tuu-online"
import { planesOnline, tokenPagoValido } from "@/lib/pos/cobro-online"
import { estadoPos, precioDe, ETIQUETA_ESTADO } from "@/lib/pos/cobro"
import { formatoCLP, CORREO_CONTACTO } from "@/lib/pos/config"
import { fechaLarga } from "@/lib/pos/fechas"
import { linkPagoPara } from "@/lib/pos/links-pago"
import { correoCobroDe } from "@/lib/pos/cobro"
import { mpSuscripcionesListas, suscripcionVigente } from "@/lib/pos/mp-suscripcion"
import PosAuthCard from "../_components/PosAuthCard"
import BotonesPagoOnline, { planesBoton } from "../_components/BotonesPagoOnline"

export const metadata = { title: "Pagar plan — Hypnos POS" }
export const dynamic = "force-dynamic"

// Link de pago de una cuenta sin iniciar sesión (botón del correo de cobro o link que Hypnos envía por WhatsApp).
// GET solo muestra: el cobro se crea al apretar el botón (POST), así los antivirus de correo que abren
// los links no generan intentos de pago.
export default async function PagarPage({ searchParams }: { searchParams: Promise<{ c?: string; t?: string; error?: string }> }) {
  const { c = "", t = "", error } = await searchParams
  const valido = tokenPagoValido(c, t)
  const cuenta = valido
    ? await prisma.posCuenta.findUnique({ where: { id: c }, include: { cliente: { select: { fechaVencimiento: true, suspendida: true, activo: true, emailContacto: true } }, usuarios: { select: { email: true }, take: 1 } } })
    : null

  if (!cuenta || cuenta.eliminadaAt || !cuenta.cliente?.activo) {
    return (
      <PosAuthCard titulo="Link no válido" subtitulo="Hypnos POS">
        <p className="text-sm text-gray-600">Este link de pago no es válido o expiró. Escríbenos a <a className="underline" href={`mailto:${CORREO_CONTACTO}`}>{CORREO_CONTACTO}</a> o entra a tu portal.</p>
        <Link href="/pos/pago" className="mt-4 block text-center text-sm font-semibold text-indigo-600">Ir a mi portal</Link>
      </PosAuthCard>
    )
  }

  const precio = precioDe(cuenta)
  const { estado } = estadoPos(cuenta)
  const online = tuuOnlineEnabled()
  const planes = online ? planesBoton(precio, await planesOnline(precio), formatoCLP) : []
  const respaldo = online ? null : await linkPagoPara(precio)
  // pago automático mensual con Mercado Pago (Suscripciones): se autoriza la tarjeta una vez
  const mpListo = mpSuscripcionesListas()
  const sus = mpListo ? await suscripcionVigente(cuenta.id) : null
  const susActiva = sus?.estado === "authorized" || sus?.estado === "paused"
  const emailMp = sus?.payerEmail || correoCobroDe(cuenta) || ""

  return (
    <PosAuthCard titulo={`Pagar ${cuenta.nombre}`} subtitulo="Plan Hypnos POS">
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-sm text-gray-700">
          <p><b>Estado:</b> {ETIQUETA_ESTADO[estado]}</p>
          <p><b>Vence:</b> {fechaLarga(cuenta.cliente.fechaVencimiento)}</p>
          <p><b>Mensualidad:</b> {formatoCLP(precio)}</p>
        </div>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">{error}</p>}
        {mpListo && (susActiva ? (
          <p className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-xl p-3">
            Ya tienes el <b>pago automático con Mercado Pago</b> activo ({sus?.payerEmail}). Tu plan se renueva solo cada mes.
          </p>
        ) : (
          <form method="post" action="/api/pos-pago/mp-suscripcion" className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4 space-y-3">
            <p className="text-sm font-bold text-gray-900">Paga automático cada mes con Mercado Pago</p>
            <p className="text-xs text-gray-600">
              Autorizas tu tarjeta una sola vez (crédito, débito o prepago) y Mercado Pago cobra {formatoCLP(precio)} cada mes. Tu plan se renueva solo, sin subir comprobantes. Puedes cancelarlo cuando quieras desde tu portal.
            </p>
            <input type="hidden" name="c" value={c} />
            <input type="hidden" name="t" value={t} />
            <label className="block text-xs font-medium text-gray-700">
              Correo de tu cuenta de Mercado Pago
              <input type="email" name="email" required defaultValue={emailMp} className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
            </label>
            <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700">
              {sus?.estado === "pending" ? "Terminar de autorizar en Mercado Pago" : `Pagar automático con Mercado Pago · ${formatoCLP(precio)}/mes`}
            </button>
          </form>
        ))}
        {online ? (
          <>
            <BotonesPagoOnline planes={planes} c={c} t={t} />
            <p className="text-xs text-gray-500">Pago seguro con Webpay (TUU). Tu plan se renueva solo apenas se confirma el pago y te llega el comprobante por correo.</p>
          </>
        ) : (
          <p className="text-sm text-gray-600">
            {respaldo ? <>Paga con <a className="underline font-semibold" href={respaldo} target="_blank" rel="noopener noreferrer">este link</a> o por transferencia, </> : mpListo ? "O, si prefieres, paga por transferencia " : "Paga por transferencia "}
            y sube el comprobante en tu <Link className="underline" href="/pos/pago">portal</Link>.
          </p>
        )}
      </div>
    </PosAuthCard>
  )
}
