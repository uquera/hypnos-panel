import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { tokenEstadoValido } from "@/lib/pos/registro"
import { urlAbrirSistema } from "@/lib/pos/acceso"

export const dynamic = "force-dynamic"

// Ventana en que la pantalla final del registro puede abrir el sistema sin contraseña
const VENTANA_MS = 3 * 60 * 60_000

// GET /api/pos-registro/abrir?id=…&t=… — "Abrir mi sistema" de la pantalla "¡Está listo!".
// El token (HMAC del id) lo tiene solo el navegador que hizo el registro. Pasada la ventana,
// o si algo no calza, abre el login normal del sistema.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const id = url.searchParams.get("id") ?? ""
  const t  = url.searchParams.get("t") ?? ""
  if (!id || !tokenEstadoValido(id, t)) return NextResponse.redirect(new URL("/pos/login", req.url), 303)

  const cuenta = await prisma.posCuenta.findUnique({
    where: { id },
    select: {
      posUrl: true, estadoAlta: true, altaAt: true, activo: true, eliminadaAt: true,
      cliente: { select: { masterKey: true } },
      usuarios: { where: { rol: "DUENO", activo: true }, orderBy: { createdAt: "asc" }, take: 1, select: { email: true } },
    },
  })
  if (!cuenta || cuenta.estadoAlta !== "LISTO" || !cuenta.activo || cuenta.eliminadaAt) {
    return NextResponse.redirect(new URL("/pos/login", req.url), 303)
  }
  const dueno = cuenta.usuarios[0]
  const reciente = !!cuenta.altaAt && Date.now() - cuenta.altaAt.getTime() < VENTANA_MS
  const destino = dueno && reciente ? urlAbrirSistema(cuenta, dueno.email) : cuenta.posUrl
  return NextResponse.redirect(destino, { status: 303, headers: { "Cache-Control": "no-store" } })
}
