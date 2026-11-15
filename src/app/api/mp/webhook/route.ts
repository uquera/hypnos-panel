import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { procesarAvisoSuscripcion } from "@/lib/pos/mp-suscripcion"
import { procesarOrdenComercial, procesarPagoContratacion } from "@/lib/pos/contratar"

// POST /api/mp/webhook — dirección ÚNICA de avisos de la app de Mercado Pago de Hypnos
// (Mercado Pago Developers → app → Webhooks admite una sola URL para todas las cuentas).
//  - Suscripciones (cobro automático de Hypnos POS): se procesan aquí, en el panel.
//  - Pagos de la contratación online (temas "payment" y "merchant_order", vienen de la notification_url
//    de cada preferencia): se aplican al pedido si su external_reference es "pedido:<id>"; otros se ignoran.
//  - Máquinas Point (tema "order"): se reenvían a cada local de Hypnos POS. Cada uno vuelve a pedir
//    la order a Mercado Pago con SU token: si no es suya, la ignora (por eso basta reenviar a todos).
// Nunca se confía en el contenido del aviso: todo se relee en la API de Mercado Pago.
// Siempre 200 (si no, Mercado Pago reintenta el mismo aviso).

export const dynamic = "force-dynamic"

const SUSCRIPCION = new Set(["subscription_preapproval", "subscription_authorized_payment", "preapproval", "authorized_payment"])

async function reenviarALocales(req: NextRequest, raw: string) {
  const cuentas = await prisma.posCuenta.findMany({
    where: { eliminadaAt: null, activo: true, estadoAlta: { in: ["LISTO", "MANUAL"] } },
    select: { posUrl: true },
  })
  const urls = [...new Set(cuentas.map(c => c.posUrl.replace(/\/$/, "")).filter(u => /^https:\/\//.test(u)))]
  const qs = req.nextUrl.search
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  for (const h of ["x-signature", "x-request-id"]) {
    const v = req.headers.get(h)
    if (v) headers[h] = v
  }
  const r = await Promise.allSettled(urls.map(u =>
    fetch(`${u}/api/public/mp-point/webhook${qs}`, { method: "POST", headers, body: raw, signal: AbortSignal.timeout(8000) })))
  return `order:reenviado:${r.filter(x => x.status === "fulfilled").length}/${urls.length}`
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } | null = null
  try { body = raw ? JSON.parse(raw) : null } catch { body = null }
  const sp = req.nextUrl.searchParams
  const tipo = body?.type ?? body?.topic ?? sp.get("type") ?? sp.get("topic") ?? ""
  const id = String(body?.data?.id ?? sp.get("data.id") ?? sp.get("id") ?? "")
  try {
    let hecho = "ignorado"
    if (SUSCRIPCION.has(tipo)) hecho = await procesarAvisoSuscripcion(tipo, id)
    else if (tipo === "order") hecho = await reenviarALocales(req, raw)
    else if (tipo === "payment") hecho = `payment:${await procesarPagoContratacion(id)}`
    else if (tipo === "merchant_order") hecho = `merchant_order:${await procesarOrdenComercial(id)}`
    console.info("[mp-webhook]", tipo || "-", body?.action ?? "", id, hecho)
  } catch (e) {
    console.error("[mp-webhook] error", tipo, id, e)
  }
  return NextResponse.json({ ok: true })
}
