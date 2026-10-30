import { NextResponse } from "next/server"
import { cerrarSesionPos } from "@/lib/pos/sesion"

// POST /api/pos-portal/logout — cierra la sesión del portal (no toca la del panel).
export async function POST() {
  await cerrarSesionPos()
  return NextResponse.json({ ok: true })
}
