import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { aprobarComprobante, rechazarComprobante } from "@/lib/pos/comprobantes"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/pos-admin/comprobantes/:id — { accion: "aprobar", monto?, meses? } | { accion: "rechazar", motivo }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params
  const operador = { id: session.user.id, nombre: session.user.name ?? "Hypnos" }

  return manejar(async () => {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    if (body.accion === "aprobar") {
      const r = await aprobarComprobante(id, operador, Number(body.monto) || undefined, Number(body.meses) || undefined)
      return NextResponse.json({ ok: true, hasta: r.hasta.toISOString(), syncedRemote: r.syncedRemote, syncError: r.syncError })
    }
    if (body.accion === "rechazar") {
      await rechazarComprobante(id, String(body.motivo ?? ""), operador)
      return NextResponse.json({ ok: true })
    }
    throw new ErrorPos("Acción no válida.")
  })
}
