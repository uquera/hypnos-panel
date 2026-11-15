import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { ErrorPos } from "@/lib/pos/usuarios"
import { buscarCupon, describirCupon } from "@/lib/pos/contratar"

// POST /api/pos-registro/cupon {codigo} — valida un cupón de la contratación online (/pos/contratar).
// Solo informa: el descuento lo vuelve a calcular el servidor al crear el pedido. 20 intentos/hora por IP.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  return manejar(async () => {
    if (excedeLimite(`pos-cupon:${ipDe(req) || "sin-ip"}`, 20, 60 * 60_000)) return jsonError("Demasiados intentos. Prueba en una hora.", 429)
    const body = (await req.json().catch(() => null)) as { codigo?: string } | null
    if (!body) throw new ErrorPos("Formato no válido.")
    const c = await buscarCupon(String(body.codigo ?? ""))
    return NextResponse.json({ ok: true, cupon: { codigo: c.codigo, tipo: c.tipo, valor: c.valor, soloAnual: c.soloAnual }, descripcion: describirCupon(c) })
  })
}
