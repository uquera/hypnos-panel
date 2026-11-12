import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSesionPos } from "@/lib/pos/sesion"
import { urlAbrirSistema } from "@/lib/pos/acceso"
import { basePublica } from "@/lib/pos/servidor"
import { cadenaDe } from "@/lib/pos/cadena"

export const dynamic = "force-dynamic"

// GET /api/pos-portal/abrir[?ir=/ruta][&cuenta=<id>] — botón "Abrir mi sistema": entra al sistema del local
// con la sesión ya abierta (token de un uso). Con ?cuenta= el dueño de una cadena entra a otro de sus
// locales (Mi cadena): solo si ese local es de su cadena. Sin sesión del portal, al login.
export async function GET(req: Request) {
  const yo = await getSesionPos()
  const params = new URL(req.url).searchParams
  if (!yo) return NextResponse.redirect(new URL("/pos/login?next=/pos/inicio", basePublica(req)), 303)

  let cuentaId = yo.cuentaId
  const otra = params.get("cuenta")
  if (otra && otra !== yo.cuentaId) {
    const cadena = await cadenaDe(yo.email)
    if (!cadena?.cuentas.some((c) => c.id === otra)) return NextResponse.redirect(new URL("/pos/inicio", basePublica(req)), 303)
    cuentaId = otra
  }
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: cuentaId },
    select: { posUrl: true, estadoAlta: true, cliente: { select: { masterKey: true } } },
  })
  if (!cuenta?.posUrl) return NextResponse.redirect(new URL("/pos/inicio", basePublica(req)), 303)
  return NextResponse.redirect(urlAbrirSistema(cuenta, yo.email, params.get("ir")), { status: 303, headers: { "Cache-Control": "no-store" } })
}
