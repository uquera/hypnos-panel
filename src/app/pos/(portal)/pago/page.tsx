import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireSesionPos } from "@/lib/pos/sesion"
import { estadoPos, precioDe, ETIQUETA_ESTADO } from "@/lib/pos/cobro"
import { datosTransferencia, formatoCLP, CORREO_CONTACTO, diasGracia } from "@/lib/pos/config"
import { fechaLarga, fechaCorta } from "@/lib/pos/fechas"
import PagoCliente from "./PagoCliente"
import { opcionesPago } from "@/lib/pos/links-pago"
import { tuuOnlineEnabled } from "@/lib/tuu-online"
import { planesOnline } from "@/lib/pos/cobro-online"
import { planesBoton } from "../../_components/BotonesPagoOnline"
import { mpSuscripcionesListas, sincronizarSuscripcion, suscripcionVigente } from "@/lib/pos/mp-suscripcion"
import { ofertaAnual } from "@/lib/pos/contratar"

export const metadata = { title: "Pago — Mi Hypnos" }
export const dynamic = "force-dynamic"

// Pago mensual: estado del plan, pago con tarjeta (link TUU del monto) o transferencia, y subida del comprobante.
export default async function PosPagoPage({ searchParams }: { searchParams: Promise<{ error?: string; mp?: string }> }) {
  const { error, mp: vueltaMp } = await searchParams
  const yo = await requireSesionPos("/pos/pago")
  if (yo.rol !== "DUENO") redirect("/pos/inicio")

  // Pago automático (Mercado Pago): al volver de autorizar la tarjeta, o si sigue pendiente, se
  // relee en Mercado Pago para mostrar el estado real (y registrar la primera cuota si ya llegó).
  let sus = mpSuscripcionesListas() ? await suscripcionVigente(yo.cuentaId) : null
  if (sus && (vueltaMp === "volver" || sus.estado === "pending")) {
    await sincronizarSuscripcion(sus.mpId).catch(e => console.error("[pos/pago] sincronizar suscripción:", e))
    sus = await suscripcionVigente(yo.cuentaId)
  }

  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: yo.cuentaId },
    include: {
      cliente: { include: { pagos: { where: { concepto: "LICENCIA" }, orderBy: { fechaPago: "desc" }, take: 24 } } },
      comprobantes: { orderBy: { createdAt: "desc" }, take: 24 },
    },
  })
  if (!cuenta) redirect("/pos/login")

  const { estado, dias } = estadoPos(cuenta)
  const vence = cuenta.cliente?.fechaVencimiento ?? null
  const monto = precioDe(cuenta)
  const datos = datosTransferencia()
  // opciones con tarjeta del plan: mensualidad y, si existe, pago por varios meses (anual)
  const opciones = (await opcionesPago(monto)).map(o => ({
    meses: o.meses, url: o.url, montoTxt: formatoCLP(o.monto),
    ahorroTxt: o.monto < monto * o.meses ? formatoCLP(monto * o.meses - o.monto) : null,
  }))

  // pago en línea TUU (renovación automática por callback); sin configurar, quedan los links fijos
  const planes = tuuOnlineEnabled() && cuenta.cliente ? planesBoton(monto, await planesOnline(monto), formatoCLP) : []

  const oferta = estado === "SUSPENDIDO" ? null : await ofertaAnual(cuenta.id).catch(() => null)

  let titulo = ETIQUETA_ESTADO[estado]
  let detalle = ""
  let tono: "verde" | "ambar" | "rojo" | "gris" = "gris"
  if (vence) {
    if (estado === "SUSPENDIDO") { titulo = "Sistema suspendido"; detalle = "Paga con tarjeta o transfiere, y sube tu comprobante para reactivarlo."; tono = "rojo" }
    else if (estado === "VENCIDO") { titulo = "Plan vencido"; detalle = `Venció el ${fechaLarga(vence)}. Paga pronto: se suspende ${diasGracia()} días después del vencimiento.`; tono = "rojo" }
    else if (estado === "EN_PRUEBA") { titulo = `En prueba gratis · ${dias === 0 ? "termina hoy" : `${dias} día${dias === 1 ? "" : "s"}`}`; detalle = `Tu prueba termina el ${fechaLarga(vence)}.`; tono = "ambar" }
    else if (estado === "POR_VENCER") { titulo = `Vence ${dias === 0 ? "hoy" : `en ${dias} día${dias === 1 ? "" : "s"}`}`; detalle = `Tu plan vence el ${fechaLarga(vence)}.`; tono = "ambar" }
    else if (estado === "AL_DIA") { titulo = "Al día"; detalle = `Tu plan está activo hasta el ${fechaLarga(vence)}.`; tono = "verde" }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Pago mensual</h1>
        <p className="text-sm text-gray-500 mt-0.5">Hypnos POS · {cuenta.nombre}</p>
      </div>
      <PagoCliente
        estado={{ titulo, detalle, tono }}
        monto={monto}
        montoTxt={formatoCLP(monto)}
        datos={datos}
        opciones={opciones}
        planesOnline={planes}
        error={error ? error.slice(0, 200) : null}
        contacto={CORREO_CONTACTO}
        sinPlan={!cuenta.cliente}
        anual={oferta && !oferta.yaAnual ? {
          montoTxt: formatoCLP(oferta.anual), mensualTxt: formatoCLP(Math.round(oferta.anual / 12)), ahorroTxt: formatoCLP(oferta.ahorro),
          cuotas: oferta.cuotas, sinInteres: oferta.cuotasSinInteres, marcha: oferta.incluyeMarcha,
        } : null}
        automatico={mpSuscripcionesListas() ? {
          estado: sus?.estado ?? null,
          email: sus?.payerEmail || yo.email,
          initPoint: sus?.estado === "pending" ? sus.initPoint : null,
          ultimoCobro: sus?.ultimoCobroAt ? fechaLarga(sus.ultimoCobroAt) : null,
        } : null}
        pagos={(cuenta.cliente?.pagos ?? []).map(p => ({
          id: p.id, fecha: fechaCorta(p.fechaPago), monto: formatoCLP(p.monto),
          periodo: p.periodoInicio && p.periodoFin ? `${fechaCorta(p.periodoInicio)} → ${fechaCorta(p.periodoFin)}` : "",
        }))}
        comprobantes={cuenta.comprobantes.map(c => ({
          id: c.id, fecha: fechaCorta(c.createdAt), monto: formatoCLP(c.montoDeclarado), estado: c.estado, motivo: c.motivoRechazo,
        }))}
      />
    </div>
  )
}
