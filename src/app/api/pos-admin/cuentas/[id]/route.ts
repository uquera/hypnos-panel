import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { editarCuenta } from "@/lib/pos/cuentas"
import { logActividad } from "@/lib/actividad"

// PATCH /api/pos-admin/cuentas/:id — Hypnos edita cualquier dato de la cuenta (multipart).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params

  return manejar(async () => {
    const { antes, cuenta } = await editarCuenta(id, await req.formData(), "admin")
    const detalle = antes.activo !== cuenta.activo
      ? (cuenta.activo ? "reactivó" : "suspendió")
      : antes.codigo !== cuenta.codigo ? `código ${antes.codigo} → ${cuenta.codigo}` : "editó marca/datos"
    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      accion: "POS_CUENTA_EDITADA", detalle: `${cuenta.nombre} (${cuenta.codigo}): ${detalle}`,
    })
    return NextResponse.json({ ok: true })
  })
}
