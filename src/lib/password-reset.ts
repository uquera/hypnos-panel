import crypto from "crypto"
import { prisma } from "@/lib/prisma"

// Enlaces de recuperación de contraseña SIN tabla nueva:
// token = base64url({uid, exp}) + "." + HMAC(secret, payload + passwordHash actual).
// Al cambiar la contraseña cambia el hash → el enlace deja de servir (un solo uso).

export const RESET_TTL_MIN = 30

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!s) throw new Error("Falta NEXTAUTH_SECRET")
  return s
}

function firma(payload: string, passwordHash: string): string {
  return crypto.createHmac("sha256", secret()).update(`${payload}.${passwordHash}`).digest("base64url")
}

export function crearTokenReset(user: { id: string; passwordHash: string }): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: user.id, exp: Date.now() + RESET_TTL_MIN * 60_000 })
  ).toString("base64url")
  return `${payload}.${firma(payload, user.passwordHash)}`
}

export async function verificarTokenReset(token: string) {
  const [payload, sig] = String(token ?? "").split(".")
  if (!payload || !sig) return null

  let data: { uid?: string; exp?: number }
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!data.uid || !data.exp || Date.now() > data.exp) return null

  const user = await prisma.user.findUnique({ where: { id: data.uid } })
  if (!user || !user.activo) return null

  const esperada = Buffer.from(firma(payload, user.passwordHash))
  const recibida = Buffer.from(sig)
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null

  return user
}
