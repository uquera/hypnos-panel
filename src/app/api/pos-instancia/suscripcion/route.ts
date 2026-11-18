import { NextResponse } from "next/server"
import { jsonError, manejar } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { accionSuscripcion, cuentaPorClave, resumenSuscripcion } from "@/lib/pos/instancia"

// /api/pos-instancia/suscripcion — la llama el servidor de cada local de Hypnos POS (módulo
// Administración → Mi suscripción), nunca el navegador. Autoriza la cabecera X-Master-Key:
// la GOBERNANZA_MASTER_KEY de esa instancia, que identifica la cuenta.
//   GET  → plan, estado, pago automático (tarjeta, próximo cobro) e historial de pagos.
//   POST { accion: "suscribir" | "cambiar-tarjeta" | "cancelar" | "anual" | "sincronizar", email?, volver?, por? }

export const dynamic = "force-dynamic"
const SIN_CACHE = { "Cache-Control": "no-store" }

async function cuenta(req: Request) {
  if (excedeLimite(`pos-instancia:${ipDe(req) || "local"}`, 120, 60_000)) return { error: jsonError("Demasiadas consultas. Espera un minuto.", 429) }
  const id = await cuentaPorClave(req.headers.get("x-master-key"))
  if (!id) return { error: jsonError("No autorizado.", 401) }
  return { id }
}

export async function GET(req: Request) {
  const c = await cuenta(req)
  if (c.error) return c.error
  return manejar(async () => NextResponse.json(await resumenSuscripcion(c.id), { headers: SIN_CACHE }))
}

export async function POST(req: Request) {
  const c = await cuenta(req)
  if (c.error) return c.error
  const body = (await req.json().catch(() => ({}))) as Record<string, string>
  if (body.accion !== "sincronizar" && excedeLimite(`pos-instancia-accion:${c.id}`, 15, 60 * 60_000)) return jsonError("Demasiados intentos. Intenta más tarde.", 429)
  return manejar(async () => NextResponse.json(await accionSuscripcion(c.id, body), { headers: SIN_CACHE }))
}
