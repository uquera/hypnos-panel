import { NextResponse } from "next/server"
import { canjearPaseSoporte } from "@/lib/pos/sesion"
import { basePortal } from "@/lib/pos/servidor"

export const dynamic = "force-dynamic"

// GET /api/pos-portal/soporte?t=<pase> — canjea el pase de "Ver portal como dueño" (lo firma el
// panel, vale 60 s y un uso) y abre el portal en modo soporte. Pase inválido → al login.
export async function GET(req: Request) {
  const pase = new URL(req.url).searchParams.get("t") ?? ""
  const ok = await canjearPaseSoporte(pase)
  const destino = ok ? "/pos/inicio" : "/pos/login"
  return NextResponse.redirect(new URL(destino, basePortal(req)), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
}
