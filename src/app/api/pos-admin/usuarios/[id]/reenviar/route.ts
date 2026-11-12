import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { enviarInvitacion } from "@/lib/pos/usuarios"
import { basePortal } from "@/lib/pos/servidor"

// POST /api/pos-admin/usuarios/:id/reenviar — enlace nuevo de 7 días (anula el anterior).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params

  return manejar(async () => {
    const enviado = await enviarInvitacion(id, "Hypnos", basePortal(req))
    if (!enviado) return jsonError("No pudimos enviar el correo. Intenta de nuevo en unos minutos.", 502)
    return NextResponse.json({ ok: true })
  })
}
