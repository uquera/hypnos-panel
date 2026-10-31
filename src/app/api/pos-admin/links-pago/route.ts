import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { getLinksPago, guardarLinksPago } from "@/lib/pos/links-pago"

/** Links de cobro TUU por monto (tarjeta /admin/pos). PUT { filas: [{ monto, url }] }. */
export async function GET() {
  if (!(await adminPos())) return jsonError("No autorizado", 401)
  return NextResponse.json(await getLinksPago())
}

export async function PUT(req: Request) {
  if (!(await adminPos())) return jsonError("No autorizado", 401)
  return manejar(async () => {
    const body = (await req.json().catch(() => ({}))) as { filas?: unknown }
    if (!Array.isArray(body.filas)) return jsonError("Formato inválido")
    const err = await guardarLinksPago(body.filas as { monto: unknown; url: unknown }[])
    if (err) return jsonError(err)
    return NextResponse.json(await getLinksPago())
  })
}
