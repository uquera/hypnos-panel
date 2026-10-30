import { NextResponse } from "next/server"
import { editarCuenta } from "@/lib/pos/cuentas"
import { jsonError, manejar, mismoOrigen, portalPos } from "@/lib/pos/api"

// PATCH /api/pos-portal/marca — el negocio edita SU marca (nombre visible, colores, logo).
// El código, el link y el estado los maneja solo Hypnos: editarCuenta los ignora en modo "portal".
export async function PATCH(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const usuario = await portalPos()
  if (!usuario) return jsonError("Tu sesión terminó. Vuelve a ingresar.", 401)

  return manejar(async () => {
    await editarCuenta(usuario.cuentaId, await req.formData(), "portal")
    return NextResponse.json({ ok: true })
  })
}
