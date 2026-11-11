import { NextRequest, NextResponse } from "next/server"
import { tuuOnlineConfig, tuuVerify } from "@/lib/tuu-online"
import { procesarCallbackTuu } from "@/lib/pos/cobro-online"

// POST /api/pos-pago/tuu-callback — notificación server-to-server de TUU (fuente de verdad del pago).
// Público (sin login), x-www-form-urlencoded. Firma inválida → 400; firma válida → SIEMPRE 200,
// porque TUU reintenta hasta 10 veces. Idempotente: un reintento no renueva dos veces.
// Log: [tuu-licencia] referencia, estado, monto. Nunca la firma, la llave ni datos del pagador.

export const dynamic = "force-dynamic"

const ok = () => new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } })

async function leerCampos(req: NextRequest): Promise<Record<string, string>> {
  const raw = await req.text()
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>
      return Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v == null ? "" : String(v)]))
    } catch {
      return {}
    }
  }
  return Object.fromEntries(new URLSearchParams(raw))
}

export async function POST(req: NextRequest) {
  const cfg = tuuOnlineConfig()
  if (!cfg) return NextResponse.json({ error: "Pago en línea no configurado" }, { status: 503 })

  const f = await leerCampos(req)
  if (!tuuVerify(f, cfg.secret)) {
    console.warn("[tuu-licencia]", { referencia: f.x_reference, estado: "firma-invalida", monto: f.x_amount })
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 })
  }
  if (f.x_account_id !== cfg.accountId) {
    console.warn("[tuu-licencia]", { referencia: f.x_reference, estado: "otra-cuenta", monto: f.x_amount })
    return ok()
  }
  try {
    await procesarCallbackTuu(f, cfg)
  } catch (e) {
    // procesarCallbackTuu no debería lanzar; si la base falla, igual 200 (queda en el log para revisar)
    console.error("[tuu-licencia]", { referencia: f.x_reference, estado: "excepcion", monto: f.x_amount, error: e instanceof Error ? e.message : String(e) })
  }
  return ok()
}
