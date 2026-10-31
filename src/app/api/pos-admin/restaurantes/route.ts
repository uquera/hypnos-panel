import { NextResponse } from "next/server"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { crearRestaurante, leerDatosRestaurante } from "@/lib/pos/registro"
import { finDelDiaChile } from "@/lib/pos/fechas"
import { ErrorPos } from "@/lib/pos/usuarios"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { leerOnboarding } from "@/lib/pos/onboarding"

// POST /api/pos-admin/restaurantes — "Crear restaurante" desde /admin/pos (mismo flujo que el
// registro público): Cliente + PosCuenta + dueño + instalación automática.
// multipart: nombre, dueno, email, whatsapp, codigo, prueba ("true"), vence (YYYY-MM-DD), precioMensual,
// y opcionales de onboarding: menuUrl, mesas, direccion, horario, logo, clientes.
export async function POST(req: Request) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)

  return manejar(async () => {
    const fd = await req.formData().catch(() => null)
    if (!fd) throw new ErrorPos("Formato no válido.")
    const datos = leerDatosRestaurante(fd)
    const prueba = fd.get("prueba") === "true"
    const vence  = prueba ? undefined : finDelDiaChile(String(fd.get("vence") ?? ""))
    if (!prueba && (!vence || vence.getTime() < Date.now())) throw new ErrorPos("Elige una fecha de vencimiento futura.")
    const precio = Number(fd.get("precioMensual"))
    const onboarding = await leerOnboarding(fd)

    const id = await crearRestaurante(datos, { enPrueba: prueba, vence: vence ?? undefined, origen: "ADMIN", onboarding })
    if (precio > 0) await prisma.posCuenta.update({ where: { id }, data: { precioMensual: Math.round(precio) } })

    await logActividad({
      usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
      clienteNombre: datos.nombre, accion: "POS_RESTAURANTE_CREADO",
      detalle: `${datos.nombre} (${datos.codigo}) · ${prueba ? "prueba" : "pagado"}`,
    })
    return NextResponse.json({ ok: true, id }, { status: 201 })
  })
}
