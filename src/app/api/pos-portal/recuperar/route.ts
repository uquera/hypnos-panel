import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { crearToken } from "@/lib/pos/tokens"
import { enviarRecuperacionPos } from "@/lib/pos/email"
import { jsonError, mismoOrigen } from "@/lib/pos/api"
import { basePublica, excedeLimite, ipDe } from "@/lib/pos/servidor"
import { EMAIL_RE } from "@/lib/pos/validacion"

// POST /api/pos-portal/recuperar — enlace de 1 hora para elegir otra contraseña.
// Responde siempre lo mismo (exista o no el correo, esté o no suspendida la cuenta).

const RESPUESTA = { ok: true, mensaje: "Si el correo tiene acceso a Hypnos POS, te enviamos un enlace para elegir una nueva contraseña." }

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  const body  = await req.json().catch(() => ({}))
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 180)
  if (!EMAIL_RE.test(email)) return jsonError("Escribe un correo válido.")

  const ip = ipDe(req)
  if (excedeLimite(`pos-rec:e:${email}`, 3, 15 * 60_000) || (ip && excedeLimite(`pos-rec:i:${ip}`, 10, 15 * 60_000))) {
    return jsonError("Demasiados intentos. Espera unos minutos y vuelve a probar.", 429)
  }

  const usuario = await prisma.posUsuario.findUnique({ where: { email }, include: { cuenta: true } })
  if (usuario && usuario.activo && usuario.cuenta.activo) {
    const token = await crearToken(usuario.id, "RECUPERACION")
    const link  = `${basePublica(req)}/pos/crear-contrasena?token=${encodeURIComponent(token)}`
    try {
      await enviarRecuperacionPos({ nombre: usuario.nombre, email: usuario.email, link, cuenta: usuario.cuenta })
    } catch (err) {
      // No se revela al navegador: la respuesta sigue siendo neutra
      console.error("[pos-recuperar] no se pudo enviar el correo:", err)
    }
  }
  return NextResponse.json(RESPUESTA)
}
