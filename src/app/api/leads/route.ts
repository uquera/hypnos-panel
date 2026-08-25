import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

const MAX_POR_IP_HORA = 5

/** IP real del visitante. Detrás de Cloudflare + nginx la cadena es CF → nginx → app. */
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.slice(0, 45)
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim().slice(0, 45)
  return ""
}

function campo(fd: FormData, k: string, max: number): string {
  return String(fd.get(k) ?? "").trim().slice(0, max)
}

// ─── POST — captura pública desde la landing ──────────────────────────────────
// Sin autenticación a propósito: lo llama el formulario de hypnosapps.com/landing.

export async function POST(req: Request) {
  let fd: FormData
  try {
    fd = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: "Formato no válido." }, { status: 400 })
  }

  // Honeypot: los bots rellenan el campo oculto. Respondemos ok para no darles señal.
  if (campo(fd, "website", 1)) return NextResponse.json({ ok: true })

  const negocio  = campo(fd, "negocio", 120)
  const tipo     = campo(fd, "tipo", 60)
  const nombre   = campo(fd, "nombre", 120)
  const whatsapp = campo(fd, "whatsapp", 40)
  const email    = campo(fd, "email", 180).toLowerCase()
  const origen   = campo(fd, "origen", 80) || "landing"
  const conLogo  = campo(fd, "con_logo", 3) === "si"

  const faltan: string[] = []
  if (negocio.length < 2) faltan.push("nombre del negocio")
  if (nombre.length < 2)  faltan.push("tu nombre")

  const digitos   = whatsapp.replace(/\D/g, "")
  const emailOk   = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  if (digitos.length < 8 && !emailOk) faltan.push("un WhatsApp o correo válido")

  if (faltan.length) {
    return NextResponse.json(
      { ok: false, error: `Revisa: ${faltan.join(", ")}.` },
      { status: 422 },
    )
  }

  const ip = clientIp(req)

  try {
    if (ip) {
      const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000)
      const recientes = await prisma.lead.count({
        where: { ip, createdAt: { gt: haceUnaHora } },
      })
      if (recientes >= MAX_POR_IP_HORA) {
        return NextResponse.json(
          { ok: false, error: "Demasiadas solicitudes. Intenta más tarde." },
          { status: 429 },
        )
      }
    }

    await prisma.lead.create({
      data: {
        negocio, tipo, nombre, whatsapp, email, origen, conLogo, ip,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 255),
      },
    })
  } catch (e) {
    console.error("[leads] error al registrar:", e)
    return NextResponse.json(
      { ok: false, error: "No pudimos registrar tu solicitud." },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, message: "Solicitud registrada." })
}

// ─── GET — listado para el panel ──────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({ leads })
}
