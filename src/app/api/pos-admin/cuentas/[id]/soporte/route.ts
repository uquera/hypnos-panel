import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { adminPos, operadorDe } from "@/lib/pos/api"
import { urlSoporte } from "@/lib/pos/acceso"

export const dynamic = "force-dynamic"

// POST /api/pos-admin/cuentas/:id/soporte — "Entrar como admin" (solo ADMIN del panel).
// Deja registro en la actividad y redirige al sistema del local con un token de soporte
// de 2 minutos y un solo uso; el local abre la sesión del usuario oculto "Hypnos (soporte)".
// POST desde un formulario (no GET) para que un link externo no pueda dispararlo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const { id } = await params
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id },
    select: { codigo: true, nombre: true, posUrl: true, estadoAlta: true, eliminadaAt: true, clienteId: true, cliente: { select: { masterKey: true } } },
  })
  if (!cuenta || cuenta.eliminadaAt) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 })

  const operador = await operadorDe(session).catch(() => null)
  if (!operador) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const url = urlSoporte(cuenta, operador.nombre)
  if (!url) return NextResponse.json({ error: "Este local no tiene acceso de soporte (no fue instalado por el alta automática)." }, { status: 400 })

  await logActividad({
    usuarioId: operador.id, usuarioNombre: operador.nombre, clienteId: cuenta.clienteId ?? undefined,
    clienteNombre: cuenta.nombre, accion: "POS_SOPORTE_ENTRADA", detalle: `${cuenta.codigo}: entró como admin (soporte)`,
  })
  return NextResponse.redirect(url, 303)
}
