import { NextResponse } from "next/server"
import { jsonError } from "@/lib/pos/api"
import { excedeLimite, ipDe } from "@/lib/pos/servidor"
import { errorCodigoDisponible, sugerirCodigo, DOMINIO_POS } from "@/lib/pos/alta"
import { normalizarCodigo } from "@/lib/pos/validacion"

// GET /api/pos-registro/disponible?codigo=x  (o ?nombre=… para sugerir)
// Público: verificación en vivo del subdominio en /pos/registro. 60 consultas/min por IP.
export async function GET(req: Request) {
  const ip = ipDe(req)
  if (excedeLimite(`pos-disp:${ip}`, 60, 60_000)) return jsonError("Demasiadas consultas. Espera un momento.", 429)

  const url = new URL(req.url)
  let codigo = normalizarCodigo(url.searchParams.get("codigo"))
  const nombre = (url.searchParams.get("nombre") ?? "").slice(0, 80)
  if (!codigo && nombre) codigo = sugerirCodigo(nombre)
  if (!codigo) return NextResponse.json({ codigo: "", disponible: false, error: "Escribe un subdominio." })

  const error = await errorCodigoDisponible(codigo)
  if (!error || !nombre) {
    return NextResponse.json({ codigo, host: `${codigo}.${DOMINIO_POS}`, disponible: !error, error })
  }
  // Sugerencia ocupada: probar variantes con número
  for (let i = 2; i <= 9; i++) {
    const alt = `${codigo.slice(0, 27)}-${i}`
    if (!(await errorCodigoDisponible(alt))) {
      return NextResponse.json({ codigo: alt, host: `${alt}.${DOMINIO_POS}`, disponible: true, error: null })
    }
  }
  return NextResponse.json({ codigo, host: `${codigo}.${DOMINIO_POS}`, disponible: false, error })
}
