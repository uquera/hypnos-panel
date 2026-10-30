import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { crearCuenta } from "@/lib/pos/cuentas"
import { logActividad } from "@/lib/actividad"

// POST /api/pos-admin/cuentas — Hypnos crea una cuenta de Hypnos POS (multipart).
export async function POST(req: Request) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)

  return manejar(async () => {
    const cuenta = await crearCuenta(await req.formData())
    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      accion: "POS_CUENTA_CREADA", detalle: `${cuenta.nombre} (${cuenta.codigo})`,
    })
    return NextResponse.json({ ok: true, id: cuenta.id }, { status: 201 })
  })
}
