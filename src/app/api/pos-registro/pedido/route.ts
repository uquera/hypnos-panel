import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, manejar } from "@/lib/pos/api"
import { tokenEstado } from "@/lib/pos/registro"
import { ErrorPos } from "@/lib/pos/usuarios"
import { leerLineas, linkPagoPedido, mpCheckoutListo, sincronizarPedido, tokenPedidoValido } from "@/lib/pos/contratar"
import { datosTransferencia } from "@/lib/pos/config"

export const dynamic = "force-dynamic"

// GET  /api/pos-registro/pedido?p=…&t=… — estado del pedido para la página /pos/contratar/listo.
//      Si está pendiente con Mercado Pago, relee el pago (respaldo del webhook; como mucho cada 10 s).
// POST /api/pos-registro/pedido?p=…&t=… — link de pago de Mercado Pago (reintentar o cambiar desde transferencia).
// El token (HMAC del pedido) solo lo tiene el navegador que contrató (o el link de vuelta de Mercado Pago).

const ultimaRevision = new Map<string, number>()

async function pedidoDe(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("p") ?? "", t = url.searchParams.get("t") ?? ""
  if (!id || !tokenPedidoValido(id, t)) return null
  return id
}

export async function GET(req: Request) {
  const id = await pedidoDe(req)
  if (!id) return jsonError("No encontrado", 404)
  const ahora = Date.now()
  if (ahora - (ultimaRevision.get(id) ?? 0) > 10_000) {
    ultimaRevision.set(id, ahora)
    await sincronizarPedido(id).catch(e => console.error("[contratar] sincronizar:", e))
  }
  const p = await prisma.posPedido.findUnique({
    where: { id },
    include: { cuenta: { select: { id: true, nombre: true, codigo: true, estadoAlta: true, posUrl: true, enPrueba: true, cliente: { select: { fechaVencimiento: true } } } } },
  })
  if (!p) return jsonError("No encontrado", 404)
  return NextResponse.json({
    estado: p.estado, medio: p.medio, total: p.total, plan: p.plan, mpListo: mpCheckoutListo(),
    lineas: leerLineas(p.items), descuento: p.descuento, cupon: p.cuponCodigo,
    maquinas: p.maquinas, marcha: leerLineas(p.items).some(l => l.clave === "marcha"),
    // "Pago …" = Mercado Pago cobró un monto que no calza: lo revisa Hypnos (no se ofrece pagar de nuevo)
    revision: p.estado === "PENDIENTE" && !!p.detalle?.startsWith("Pago "),
    detalle: p.estado === "PENDIENTE" && p.detalle && !p.detalle.startsWith("Pago ") ? "Mercado Pago no aprobó el último intento. Puedes intentarlo de nuevo." : null,
    transferencia: p.medio === "TRANSFERENCIA" && p.estado === "PENDIENTE" ? datosTransferencia() : null,
    cuenta: {
      id: p.cuenta.id, token: tokenEstado(p.cuenta.id), nombre: p.cuenta.nombre, codigo: p.cuenta.codigo,
      estadoAlta: p.cuenta.estadoAlta, url: p.cuenta.estadoAlta === "LISTO" ? p.cuenta.posUrl : null,
      enPrueba: p.cuenta.enPrueba, vence: p.cuenta.cliente?.fechaVencimiento ?? null,
    },
  }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: Request) {
  const id = await pedidoDe(req)
  if (!id) return jsonError("No encontrado", 404)
  return manejar(async () => {
    const url = await linkPagoPedido(id).catch(e => { throw e instanceof ErrorPos ? e : new ErrorPos("Mercado Pago no respondió. Intenta en unos minutos.", 502) })
    return NextResponse.json({ ok: true, url })
  })
}
