import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"
import { enviarInvitacion } from "@/lib/pos/usuarios"
import { basePortal, excedeLimite } from "@/lib/pos/servidor"

// POST /api/pos-portal/usuarios/:id/reenviar — el DUENO reenvía la invitación a un EDITOR suyo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const dueno = await portalPos(true)
  if (!dueno) return jsonError("Solo el dueño de la cuenta puede hacer esto.", 403)
  const { id } = await params
  if (excedeLimite(`pos-inv:${dueno.id}`, 20, 60 * 60_000)) return jsonError("Demasiados envíos. Espera un rato.", 429)

  return manejar(async () => {
    const editor = await prisma.posUsuario.findFirst({ where: { id, cuentaId: dueno.cuentaId, rol: "EDITOR" } })
    if (!editor) return jsonError("Usuario no encontrado.", 404)
    const enviado = await enviarInvitacion(editor.id, dueno.nombre, basePortal(req))
    if (!enviado) return jsonError("No pudimos enviar el correo. Intenta de nuevo en unos minutos.", 502)
    return NextResponse.json({ ok: true })
  })
}
