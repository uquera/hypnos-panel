import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { adminPos, operadorDe } from "@/lib/pos/api"
import { basePortal } from "@/lib/pos/servidor"
import { crearPaseSoporte } from "@/lib/pos/sesion"

export const dynamic = "force-dynamic"

// POST /api/pos-admin/cuentas/:id/portal — "Ver portal como dueño" (solo ADMIN del panel).
// Abre mi.hypnosapps.com con la sesión del dueño de la cuenta en modo soporte (4 horas), para
// ayudarlo o cambiar algo por él. Queda en la actividad. POST desde un formulario para que un
// link externo no pueda dispararlo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id },
    select: { codigo: true, nombre: true, eliminadaAt: true, clienteId: true },
  })
  if (!cuenta || cuenta.eliminadaAt) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const dueno = await prisma.posUsuario.findFirst({
    where: { cuentaId: id, rol: "DUENO" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true },
  })
  if (!dueno) return NextResponse.json({ error: "Esta cuenta no tiene dueño en el portal. Agrégalo en Usuarios." }, { status: 400 })

  const operador = await operadorDe(session).catch(() => null)
  if (!operador) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  await logActividad({
    usuarioId: operador.id, usuarioNombre: operador.nombre, clienteId: cuenta.clienteId ?? undefined,
    clienteNombre: cuenta.nombre, accion: "POS_SOPORTE_PORTAL", detalle: `${cuenta.codigo}: abrió el portal como el dueño (${dueno.email})`,
  })
  const url = new URL("/api/pos-portal/soporte", basePortal(req))
  url.searchParams.set("t", crearPaseSoporte(operador.id, dueno.id))
  return NextResponse.redirect(url, 303)
}
