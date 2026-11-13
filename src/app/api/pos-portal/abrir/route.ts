import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSesionPos } from "@/lib/pos/sesion"
import { urlAbrirSistema, urlSoporte } from "@/lib/pos/acceso"
import { basePortal } from "@/lib/pos/servidor"
import { cadenaDe } from "@/lib/pos/cadena"

export const dynamic = "force-dynamic"

// GET /api/pos-portal/abrir[?ir=/ruta][&cuenta=<id>] — botón "Abrir mi sistema": entra al sistema del local
// con la sesión ya abierta (token de un uso). Con ?cuenta= el dueño de una cadena entra a otro de sus
// locales (Mi cadena): solo si ese local es de su cadena. Sin sesión del portal, al login.
export async function GET(req: Request) {
  const yo = await getSesionPos()
  const params = new URL(req.url).searchParams
  if (!yo) return NextResponse.redirect(new URL("/pos/login?next=/pos/inicio", basePortal(req)), 303)

  let cuentaId = yo.cuentaId
  const otra = params.get("cuenta")
  if (otra && otra !== yo.cuentaId) {
    const cadena = await cadenaDe(yo.email)
    if (!cadena?.cuentas.some((c) => c.id === otra)) return NextResponse.redirect(new URL("/pos/inicio", basePortal(req)), 303)
    cuentaId = otra
  }
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: cuentaId },
    select: { posUrl: true, estadoAlta: true, cliente: { select: { masterKey: true } } },
  })
  if (!cuenta?.posUrl) return NextResponse.redirect(new URL("/pos/inicio", basePortal(req)), 303)
  // Modo soporte: Hypnos entra como su usuario oculto "Hypnos (soporte)", no como el dueño
  const url = yo.soporte
    ? (urlSoporte(cuenta, yo.soporte.nombre) ?? cuenta.posUrl)
    : urlAbrirSistema(cuenta, yo.email, params.get("ir"))
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } })
}
