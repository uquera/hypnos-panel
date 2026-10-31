import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError } from "@/lib/pos/api"
import { tokenEstadoValido } from "@/lib/pos/registro"

// GET /api/pos-registro/estado?id=…&t=… — la pantalla "Estamos preparando tu sistema"
// consulta aquí cada pocos segundos. El token (HMAC del id) lo entrega solo el POST del registro.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id") ?? ""
  const t  = url.searchParams.get("t") ?? ""
  if (!id || !tokenEstadoValido(id, t)) return jsonError("No encontrado", 404)

  const cuenta = await prisma.posCuenta.findUnique({ where: { id }, select: { estadoAlta: true, posUrl: true, nombre: true } })
  if (!cuenta) return jsonError("No encontrado", 404)
  return NextResponse.json({
    estado: cuenta.estadoAlta,
    nombre: cuenta.nombre,
    url: cuenta.estadoAlta === "LISTO" ? cuenta.posUrl : null,
  }, { headers: { "Cache-Control": "no-store" } })
}
