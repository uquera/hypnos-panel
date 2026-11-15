import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { getCatalogo } from "@/lib/pos/contratar"
import { crearSolicitudMaquina } from "@/lib/pos/solicitudes"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/pos-registro/maquina — "Consigue tu máquina" (/pos/maquina). JSON:
// marca MERCADOPAGO|TUU · rut · razonSocial · nombre · telefono · email · comuna · autoriza (true) · origen
// Protección: mismo origen, honeypot "website", 5 solicitudes/hora por IP y 60/hora en total.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  return manejar(async () => {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) throw new ErrorPos("Formato no válido.")
    if (String(b.website ?? "").trim()) return NextResponse.json({ ok: true })
    const ip = ipDe(req)
    if (excedeLimite(`pos-maquina:${ip || "sin-ip"}`, 5, 60 * 60_000) || excedeLimite("pos-maquina:global", 60, 60 * 60_000)) {
      return jsonError("Recibimos demasiadas solicitudes desde tu conexión. Intenta en una hora o escríbenos por WhatsApp.", 429)
    }
    const cat = await getCatalogo()
    const id = await crearSolicitudMaquina(b, ip, cat.point)
    return NextResponse.json({ ok: true, id }, { status: 201 })
  })
}
