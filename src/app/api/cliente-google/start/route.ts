import { NextResponse, type NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  COOKIE_NOMBRE, COOKIE_PATH, COOKIE_TTL_MS, GOOGLE_AUTH_URL,
  aleatorio, allowedReturn, configClienteGoogle, hostsPermitidos, pkceChallenge, signCookie,
} from "@/lib/cliente-google"

export const dynamic = "force-dynamic"

// GET /api/cliente-google/start?return=https://<local>/cliente/google
// Inicia el ingreso con Google de un cliente final de un POS (ver src/lib/cliente-google.ts).
export async function GET(req: NextRequest) {
  const cfg = configClienteGoogle()
  if (!cfg) return NextResponse.json({ error: "Ingreso con Google no configurado" }, { status: 503 })

  const [clientes, posCuentas] = await Promise.all([
    prisma.cliente.findMany({ select: { dominio: true, apiUrl: true } }),
    prisma.posCuenta.findMany({ select: { codigo: true, posUrl: true } }),
  ])
  const retorno = allowedReturn(req.nextUrl.searchParams.get("return"), hostsPermitidos({ clientes, posCuentas }))
  if (!retorno) return NextResponse.json({ error: "URL de retorno no permitida" }, { status: 400 })

  const state = aleatorio()
  const nonce = aleatorio()
  const verifier = aleatorio(48)
  const cookie = signCookie(
    { return: retorno.toString(), state, nonce, verifier, exp: Date.now() + COOKIE_TTL_MS },
    cfg.secret,
  )

  const google = new URL(GOOGLE_AUTH_URL)
  google.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString()

  const res = NextResponse.redirect(google, 302)
  res.cookies.set(COOKIE_NOMBRE, cookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: Math.floor(COOKIE_TTL_MS / 1000),
  })
  return res
}
