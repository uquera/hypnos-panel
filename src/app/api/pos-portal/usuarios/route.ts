import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"
import { invitarUsuario, leerInvitacion, usuarioPublico } from "@/lib/pos/usuarios"
import { basePortal, excedeLimite } from "@/lib/pos/servidor"

// POST /api/pos-portal/usuarios — el DUENO invita a un EDITOR de su propia cuenta.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const dueno = await portalPos(true)
  if (!dueno) return jsonError("Solo el dueño de la cuenta puede invitar.", 403)
  if (excedeLimite(`pos-inv:${dueno.id}`, 20, 60 * 60_000)) return jsonError("Demasiadas invitaciones. Espera un rato.", 429)

  return manejar(async () => {
    const datos = leerInvitacion({ ...(await req.json().catch(() => ({}))), rol: "EDITOR" }, ["EDITOR"])
    const { usuario, enviado } = await invitarUsuario(dueno.cuentaId, datos, dueno.nombre, basePortal(req))
    return NextResponse.json({ ok: true, enviado, usuario: usuarioPublico(usuario) }, { status: 201 })
  })
}
