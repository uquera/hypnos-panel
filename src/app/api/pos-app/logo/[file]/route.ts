import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { leerLogo } from "@/lib/pos/logo"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"

// GET /api/pos-app/logo/<codigo>.png — PÚBLICA. Logo normalizado (PNG ≤ 512 px).
// La URL que entrega /config lleva ?v=<updatedAt>, así que la caché corta (5 min)
// nunca deja un logo viejo; además responde ETag y 304.

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const m = /^([a-z0-9-]{3,30})\.png$/.exec(file)
  if (!m) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  const ip = ipDe(req) || "sin-ip"
  if (excedeLimite(`pos-logo:${ip}`, 120, 60_000)) {
    return NextResponse.json({ error: "Demasiadas consultas." }, { status: 429, headers: { "Retry-After": "60" } })
  }

  const cuenta = await prisma.posCuenta.findUnique({ where: { codigo: m[1] }, select: { logo: true, updatedAt: true } })
  const png = cuenta?.logo ? await leerLogo(cuenta.logo) : null
  if (!cuenta || !png) return NextResponse.json({ error: "No encontrado" }, { status: 404, headers: { "Cache-Control": "no-store" } })

  const etag = `"${cuenta.updatedAt.getTime().toString(36)}-${png.length.toString(36)}"`
  const headers = {
    "Content-Type":  "image/png",
    "Cache-Control": "public, max-age=300",
    "ETag":          etag,
    "Last-Modified": cuenta.updatedAt.toUTCString(),
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  }
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers })
  return new NextResponse(new Uint8Array(png), { headers })
}
