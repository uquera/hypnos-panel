import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"
import { excedeLimite } from "@/lib/pos/servidor"
import { crearPedidoAnualPortal, linkPagoPedido } from "@/lib/pos/contratar"

// POST /api/pos-portal/anual — "Pásate al plan anual" de Mi Hypnos → Pago (solo DUENO).
// Crea (o reutiliza) el pedido anual del local y devuelve el link de Mercado Pago (hasta N cuotas).
// El pago se aplica igual que en la contratación online: 12 meses de licencia y, si estaba en
// prueba, la puesta en marcha incluida; el pago automático mensual se cancela solo.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const yo = await portalPos(true)
  if (!yo) return jsonError("Tu sesión venció. Vuelve a ingresar.", 401)
  if (excedeLimite(`pos-anual:${yo.cuentaId}`, 10, 60 * 60_000)) return jsonError("Demasiados intentos. Intenta más tarde.", 429)
  return manejar(async () => {
    const pedidoId = await crearPedidoAnualPortal(yo.cuentaId)
    const url = await linkPagoPedido(pedidoId)
    return NextResponse.json({ ok: true, url })
  })
}
