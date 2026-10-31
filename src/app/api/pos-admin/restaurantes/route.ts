import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { crearRestaurante, leerDatosRestaurante } from "@/lib/pos/registro"
import { finDelDiaChile } from "@/lib/pos/fechas"
import { ErrorPos } from "@/lib/pos/usuarios"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"

// POST /api/pos-admin/restaurantes — "Crear restaurante" desde /admin/pos (mismo flujo que el
// registro público): Cliente + PosCuenta + dueño + instalación automática.
// Body: { nombre, dueno, email, whatsapp, codigo, prueba: boolean, vence?: "YYYY-MM-DD", precioMensual?: number }
export async function POST(req: Request) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)

  return manejar(async () => {
    const body  = await req.json().catch(() => ({})) as Record<string, unknown>
    const datos = leerDatosRestaurante(body)
    const prueba = body.prueba === true
    const vence  = prueba ? undefined : finDelDiaChile(String(body.vence ?? ""))
    if (!prueba && (!vence || vence.getTime() < Date.now())) throw new ErrorPos("Elige una fecha de vencimiento futura.")
    const precio = Number(body.precioMensual)

    const id = await crearRestaurante(datos, { enPrueba: prueba, vence: vence ?? undefined, origen: "ADMIN" })
    if (precio > 0) await prisma.posCuenta.update({ where: { id }, data: { precioMensual: Math.round(precio) } })

    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      clienteNombre: datos.nombre, accion: "POS_RESTAURANTE_CREADO",
      detalle: `${datos.nombre} (${datos.codigo}) · ${prueba ? "prueba" : "pagado"}`,
    })
    return NextResponse.json({ ok: true, id }, { status: 201 })
  })
}
