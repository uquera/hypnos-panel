import { NextResponse, type NextRequest } from "next/server"
import {
  COOKIE_NOMBRE, COOKIE_PATH, GOOGLE_TOKEN_URL,
  conParametros, configClienteGoogle, enmascararCorreo, igualSeguro, jwksGoogle,
  readCookie, signLocalToken, verifyGoogleIdToken,
} from "@/lib/cliente-google"

export const dynamic = "force-dynamic"

// GET /api/cliente-google/callback?code&state  (o ?error=access_denied)
// Vuelve de Google, verifica el id_token y devuelve al local con un JWT corto.
// No guarda nada del cliente final en la base.
export async function GET(req: NextRequest) {
  const cfg = configClienteGoogle()
  if (!cfg) return NextResponse.json({ error: "Ingreso con Google no configurado" }, { status: 503 })

  const estado = readCookie(req.cookies.get(COOKIE_NOMBRE)?.value, cfg.secret)
  const ir = (url: string | null, status: number) => {
    const res = url ? NextResponse.redirect(url, 303) : NextResponse.json({ error: "Sesión de ingreso vencida o inválida. Vuelve a intentarlo desde el local." }, { status })
    res.cookies.set(COOKIE_NOMBRE, "", { httpOnly: true, secure: true, sameSite: "lax", path: COOKIE_PATH, maxAge: 0 })
    return res
  }
  // sin cookie válida no sabemos a dónde volver
  if (!estado) return ir(null, 400)

  const sp = req.nextUrl.searchParams
  const state = sp.get("state") ?? ""
  // el usuario canceló en Google (el return viene de la cookie firmada, no de la query)
  if (sp.get("error")) return ir(conParametros(estado.return, { error: "cancelado" }), 303)
  if (!state || !igualSeguro(state, estado.state)) return ir(conParametros(estado.return, { error: "google" }), 303)
  const code = sp.get("code")
  if (!code) return ir(conParametros(estado.return, { error: "google" }), 303)

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: "authorization_code",
        code_verifier: estado.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
    if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`)
    const data = (await tokenRes.json()) as { id_token?: string }
    if (!data.id_token) throw new Error("sin id_token")

    const perfil = await verifyGoogleIdToken(data.id_token, { clientId: cfg.clientId, nonce: estado.nonce, jwks: jwksGoogle })
    const aud = new URL(estado.return).hostname.toLowerCase()
    const token = signLocalToken(perfil, aud, cfg.secret)
    console.log(`[cliente-google] ingreso para ${aud} (${enmascararCorreo(perfil.email)})`)
    return ir(conParametros(estado.return, { token }), 303)
  } catch (e) {
    console.warn(`[cliente-google] fallo para ${new URL(estado.return).hostname}: ${e instanceof Error ? e.message : "error"}`)
    return ir(conParametros(estado.return, { error: "google" }), 303)
  }
}
