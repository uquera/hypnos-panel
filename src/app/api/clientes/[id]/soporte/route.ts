import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { operadorDe } from "@/lib/pos/api"
import { urlSoporteCliente } from "@/lib/soporte"

export const dynamic = "force-dynamic"

const aviso = (texto: string, status: number) => new NextResponse(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar como admin</title>` +
  `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#374151">` +
  `<h1 style="font-size:1.1rem">No se pudo entrar como admin</h1><p>${texto}</p></body>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
)

// POST /api/clientes/:id/soporte — "Entrar como admin" de la ficha del cliente (solo ADMIN del panel).
// Deja registro en la actividad y redirige (303) al sistema con un token de soporte de un uso.
// POST desde un formulario (no GET) para que un link externo no pueda dispararlo.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") return aviso("No autorizado.", 401)
  const { id } = await params
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    select: { id: true, nombre: true, apiUrl: true, masterKey: true, posCuentas: { select: { posUrl: true, estadoAlta: true, eliminadaAt: true } } },
  })
  if (!cliente) return aviso("Cliente no encontrado.", 404)
  const operador = await operadorDe(session).catch(() => null)
  if (!operador) return aviso("No autorizado.", 401)

  const r = await urlSoporteCliente(cliente, operador.nombre)
  if ("error" in r) return aviso(r.error, 400)
  await logActividad({
    usuarioId: operador.id, usuarioNombre: operador.nombre, clienteId: cliente.id,
    clienteNombre: cliente.nombre, accion: "SOPORTE_ENTRADA", detalle: "Entró como admin (soporte)",
  })
  return NextResponse.redirect(r.url, 303)
}
