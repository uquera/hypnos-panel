import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { crearTokenReset, RESET_TTL_MIN } from "@/lib/password-reset"
import { enviarRecuperacionPassword } from "@/lib/email"

// POST /api/recuperar — pide un enlace para restablecer la contraseña.
// Siempre responde lo mismo (exista o no el correo) para no revelar cuentas.

const LIMITE = 3
const VENTANA_MS = 15 * 60_000
const intentos = new Map<string, number[]>()

function limitado(clave: string): boolean {
  const ahora = Date.now()
  const lista = (intentos.get(clave) ?? []).filter(t => ahora - t < VENTANA_MS)
  lista.push(ahora)
  intentos.set(clave, lista)
  return lista.length > LIMITE
}

const RESPUESTA = {
  ok: true,
  mensaje: "Si el correo pertenece a una cuenta del panel, te enviamos un enlace para restablecer la contraseña.",
}

export async function POST(req: Request) {
  let email = ""
  try {
    const body = await req.json()
    email = String(body?.email ?? "").trim().toLowerCase().slice(0, 180)
  } catch {
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Escribe un correo válido." }, { status: 400 })
  }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? ""
  if (limitado(`e:${email}`) || (ip && limitado(`i:${ip}`))) {
    return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos y vuelve a probar." }, { status: 429 })
  }

  // SQLite compara con mayúsculas/minúsculas: se busca en JS (son pocos usuarios)
  const usuarios = await prisma.user.findMany({ where: { activo: true } })
  const user = usuarios.find(u => u.email.toLowerCase() === email)

  if (user) {
    const base = (process.env.AUTH_URL ?? "https://panel.hypnosapps.com").replace(/\/$/, "")
    const link = `${base}/login/restablecer?token=${encodeURIComponent(crearTokenReset(user))}`
    try {
      await enviarRecuperacionPassword({ nombre: user.nombre, email: user.email, link, minutos: RESET_TTL_MIN })
    } catch (err) {
      console.error("[recuperar] no se pudo enviar el correo:", err)
      return NextResponse.json({ error: "No pudimos enviar el correo. Intenta de nuevo en unos minutos." }, { status: 502 })
    }
  }

  return NextResponse.json(RESPUESTA)
}
