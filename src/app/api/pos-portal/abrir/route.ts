import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSesionPos } from "@/lib/pos/sesion"
import { urlAbrirSistema } from "@/lib/pos/acceso"

export const dynamic = "force-dynamic"

// GET /api/pos-portal/abrir[?ir=/ruta] — botón "Abrir mi sistema": entra al sistema del local con la
// sesión ya abierta (token de un uso). Sin sesión del portal, al login.
export async function GET(req: Request) {
  const yo = await getSesionPos()
  if (!yo) return NextResponse.redirect(new URL("/pos/login?next=/pos/inicio", req.url), 303)
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: yo.cuentaId },
    select: { posUrl: true, estadoAlta: true, cliente: { select: { masterKey: true } } },
  })
  if (!cuenta?.posUrl) return NextResponse.redirect(new URL("/pos/inicio", req.url), 303)
  return NextResponse.redirect(urlAbrirSistema(cuenta, yo.email, new URL(req.url).searchParams.get("ir")), { status: 303, headers: { "Cache-Control": "no-store" } })
}
