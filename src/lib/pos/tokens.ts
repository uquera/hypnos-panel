import crypto from "crypto"
import { prisma } from "@/lib/prisma"

// Enlaces de invitación y recuperación de Hypnos POS (tabla pos_tokens).
// El panel ya tiene enlaces HMAC sin tabla para sus operadores (lib/password-reset.ts),
// pero aquí se necesita anular invitaciones al reenviarlas y vencimientos distintos,
// así que se guarda el sha256 del token: la base nunca tiene el enlace en claro.

export type TipoToken = "INVITACION" | "RECUPERACION"

export const VIGENCIA_MS: Record<TipoToken, number> = {
  INVITACION:   7 * 24 * 60 * 60_000,   // 7 días
  RECUPERACION: 60 * 60_000,            // 1 hora
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

/** Crea un enlace nuevo y anula los pendientes del mismo tipo para ese usuario. */
export async function crearToken(usuarioId: string, tipo: TipoToken): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url")
  await prisma.$transaction([
    prisma.posToken.deleteMany({ where: { usuarioId, tipo, usadoEn: null } }),
    prisma.posToken.create({
      data: { usuarioId, tipo, tokenHash: hashToken(token), expiraEn: new Date(Date.now() + VIGENCIA_MS[tipo]) },
    }),
  ])
  return token
}

/** Busca un token vigente (sin marcarlo usado). Devuelve el registro con su usuario y cuenta. */
export async function buscarTokenVigente(token: string) {
  if (!token || token.length < 20 || token.length > 100) return null
  const registro = await prisma.posToken.findUnique({
    where:   { tokenHash: hashToken(token) },
    include: { usuario: { include: { cuenta: true } } },
  })
  if (!registro || registro.usadoEn || registro.expiraEn.getTime() < Date.now()) return null
  return registro
}
