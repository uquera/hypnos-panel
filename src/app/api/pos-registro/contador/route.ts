import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { crearPartnerLead } from "@/lib/pos/solicitudes"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/pos-registro/contador — programa para contadores (/pos/contadores). JSON:
// tipo CONTADOR|OTRO · nombre · oficina · rut (opcional) · telefono · email · clientes (rango) · origen
// Protección: mismo origen, honeypot "website", 5 envíos/hora por IP y 60/hora en total.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  return manejar(async () => {
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!b) throw new ErrorPos("Formato no válido.")
    if (String(b.website ?? "").trim()) return NextResponse.json({ ok: true })
    const ip = ipDe(req)
    if (excedeLimite(`pos-partner:${ip || "sin-ip"}`, 5, 60 * 60_000) || excedeLimite("pos-partner:global", 60, 60 * 60_000)) {
      return jsonError("Recibimos demasiados envíos desde tu conexión. Intenta en una hora o escríbenos por WhatsApp.", 429)
    }
    const id = await crearPartnerLead(b, ip)
    return NextResponse.json({ ok: true, id }, { status: 201 })
  })
}
