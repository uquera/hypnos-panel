import { NextResponse, type NextRequest } from "next/server"

// Dos direcciones, una sola app:
//  - mi.hypnosapps.com (POS_PORTAL_URL): portal de los clientes de Hypnos POS (/pos/*, /almacenes)
//    y sus APIs. Nada del panel interno de Hypnos se ve desde aquí.
//  - panel.hypnosapps.com: panel de Hypnos. Las páginas del portal que se abran aquí (enlaces viejos
//    de correos o del POS) se redirigen a mi.hypnosapps.com con la misma ruta. Las APIs siguen
//    respondiendo en ambas (app Android, callback de TUU, crons).
// Sin POS_PORTAL_URL no cambia nada (todo en una sola dirección, como antes).

const PORTAL_PAGINAS = ["/pos", "/almacenes"]
const PORTAL_APIS = ["/api/pos-portal", "/api/pos-pago", "/api/pos-registro", "/api/pos-app", "/api/almacenes"]

const empieza = (path: string, prefijos: string[]) => prefijos.some((p) => path === p || path.startsWith(`${p}/`))

function portal(): URL | null {
  const env = process.env.POS_PORTAL_URL?.trim()
  if (!env) return null
  try { return new URL(env) } catch { return null }
}

export function proxy(req: NextRequest) {
  const destino = portal()
  if (!destino) return NextResponse.next()
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase()
  const { pathname, search } = req.nextUrl

  if (host === destino.hostname) {
    if (pathname === "/") return NextResponse.redirect(new URL("/pos/inicio", destino), 307)
    // archivos estáticos (íconos, imágenes) y lo propio del portal
    if (/\.[a-z0-9]+$/i.test(pathname) || empieza(pathname, PORTAL_PAGINAS) || empieza(pathname, PORTAL_APIS)) return NextResponse.next()
    return NextResponse.redirect(new URL("/pos/inicio", destino), 307)
  }

  // en el panel: las páginas del portal se abren en mi.hypnosapps.com
  if (req.method === "GET" && empieza(pathname, PORTAL_PAGINAS)) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, destino), 308)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
