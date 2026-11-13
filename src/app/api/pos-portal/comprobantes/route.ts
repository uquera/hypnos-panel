import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"
import { excedeLimite } from "@/lib/pos/servidor"
import { subirComprobante } from "@/lib/pos/comprobantes"

// POST /api/pos-portal/comprobantes — el DUENO sube el comprobante de transferencia (multipart:
// archivo, monto, comentario). Máx. 8 MB, tipo real validado; 10 subidas/hora por cuenta.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const yo = await portalPos(true)
  if (!yo) return jsonError("Tu sesión venció. Vuelve a ingresar.", 401)
  if (excedeLimite(`pos-comp:${yo.cuentaId}`, 10, 60 * 60_000)) return jsonError("Subiste muchos comprobantes seguidos. Intenta más tarde.", 429)

  return manejar(async () => {
    const fd = await req.formData()
    const comp = await subirComprobante({
      cuentaId: yo.cuentaId,
      archivo: fd.get("archivo") as File,
      montoDeclarado: Number(String(fd.get("monto") ?? "").replace(/[^\d]/g, "")),
      comentario: String(fd.get("comentario") ?? ""),
      subidoPor: yo.soporte ? `Hypnos (soporte: ${yo.soporte.nombre})` : yo.email,
    })
    return NextResponse.json({ ok: true, id: comp.id }, { status: 201 })
  })
}
