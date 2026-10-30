import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { configPublica } from "@/lib/pos/cuentas"
import { basePublica, excedeLimite, ipDe } from "@/lib/pos/servidor"
import { normalizarCodigo } from "@/lib/pos/validacion"

// GET /api/pos-app/config?code=<codigo> — PÚBLICA, la consume la app Android Hypnos POS
// al escribir el código del negocio (y al abrir, para refrescar la marca).
// 200 config · 404 código inexistente · 403 cuenta suspendida · 429 demasiadas consultas.
// Límite: 60 consultas por minuto por IP, para que no se puedan adivinar códigos.

export const dynamic = "force-dynamic"

const SIN_CACHE = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }

export async function GET(req: Request) {
  const ip = ipDe(req) || "sin-ip"
  if (excedeLimite(`pos-app:${ip}`, 60, 60_000)) {
    return NextResponse.json(
      { error: "Demasiadas consultas. Espera un minuto." },
      { status: 429, headers: { ...SIN_CACHE, "Retry-After": "60" } },
    )
  }

  const code = normalizarCodigo(new URL(req.url).searchParams.get("code")).slice(0, 40)
  const cuenta = code ? await prisma.posCuenta.findUnique({ where: { codigo: code } }) : null
  if (!cuenta) {
    return NextResponse.json({ error: "No encontramos ese código" }, { status: 404, headers: SIN_CACHE })
  }
  if (!cuenta.activo) {
    return NextResponse.json({ error: "Esta cuenta está suspendida. Escribe a Hypnos." }, { status: 403, headers: SIN_CACHE })
  }

  return NextResponse.json(configPublica(basePublica(req), cuenta), { headers: SIN_CACHE })
}
