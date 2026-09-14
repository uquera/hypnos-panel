import crypto from "crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// POST /api/agenda/sync — respaldo en la nube de la agenda gratis (hypnosapps.com/demo/).
// Público a propósito: lo llama la agenda desde el navegador del dueño.
// Cada agenda tiene una clave secreta propia: la primera escritura fija su hash y
// las siguientes deben traer la misma clave. Leer solo se puede desde el panel.

const ID_RE      = /^[A-Za-z0-9_-]{16,64}$/
const MAX_BYTES  = 1_500_000
const LIMITE_MIN = 40
const golpes = new Map<string, number[]>()

function limitado(ip: string): boolean {
  if (!ip) return false
  const ahora = Date.now()
  const lista = (golpes.get(ip) ?? []).filter(t => ahora - t < 60_000)
  lista.push(ahora)
  if (golpes.size > 5000) golpes.clear()
  golpes.set(ip, lista)
  return lista.length > LIMITE_MIN
}

const txt   = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max)
const largo = (v: unknown) => (Array.isArray(v) ? v.length : 0)

export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? ""
  if (limitado(ip)) {
    return NextResponse.json({ ok: false, error: "Demasiadas solicitudes." }, { status: 429 })
  }

  const raw = await req.text()
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Agenda demasiado grande." }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: "Formato no válido." }, { status: 400 })
  }

  const agendaId = txt(body.id, 64)
  const key      = String(body.key ?? "")
  const data     = body.data
  if (!ID_RE.test(agendaId) || key.length < 16 || key.length > 128 ||
      !data || typeof data !== "object" || Array.isArray(data)) {
    return NextResponse.json({ ok: false, error: "Datos incompletos." }, { status: 400 })
  }

  const d = data as Record<string, unknown>
  delete d.logo // las imágenes no se respaldan

  const keyHash = crypto.createHash("sha256").update(key).digest("hex")
  const existente = await prisma.agendaBackup.findUnique({ where: { agendaId }, select: { keyHash: true } })
  if (existente) {
    const a = Buffer.from(existente.keyHash)
    const b = Buffer.from(keyHash)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 403 })
    }
  }

  const campos = {
    slug:            txt(body.slug, 60),
    negocio:         txt(body.negocio, 120),
    email:           txt(body.email, 180).toLowerCase(),
    telefono:        txt(body.telefono, 40),
    data:            JSON.stringify(d),
    clientes:        largo(d.clientes),
    servicios:       largo(d.servicios),
    citas:           largo(d.citas),
    movimientos:     largo(d.movimientos),
    ultimaActividad: new Date(),
  }

  try {
    await prisma.agendaBackup.upsert({
      where:  { agendaId },
      create: { agendaId, keyHash, ...campos },
      update: campos,
    })
  } catch (e) {
    console.error("[agenda/sync] error al guardar:", e)
    return NextResponse.json({ ok: false, error: "No se pudo guardar el respaldo." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
