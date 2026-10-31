import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireSesionPos } from "@/lib/pos/sesion"
import { estadoPos, precioDe, ETIQUETA_ESTADO } from "@/lib/pos/cobro"
import { datosTransferencia, formatoCLP, CORREO_CONTACTO, diasGracia } from "@/lib/pos/config"
import { fechaLarga, fechaCorta } from "@/lib/pos/fechas"
import PagoCliente from "./PagoCliente"

export const metadata = { title: "Pago — Hypnos POS" }
export const dynamic = "force-dynamic"

// Pago mensual por transferencia: estado del plan, datos para transferir y subida del comprobante.
export default async function PosPagoPage() {
  const yo = await requireSesionPos("/pos/pago")
  if (yo.rol !== "DUENO") redirect("/pos/marca")

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

  let titulo = ETIQUETA_ESTADO[estado]
  let detalle = ""
  let tono: "verde" | "ambar" | "rojo" | "gris" = "gris"
  if (vence) {
    if (estado === "SUSPENDIDO") { titulo = "Sistema suspendido"; detalle = "Transfiere y sube tu comprobante para reactivarlo."; tono = "rojo" }
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
        contacto={CORREO_CONTACTO}
        sinPlan={!cuenta.cliente}
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
