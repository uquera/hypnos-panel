import fs from "fs/promises"
import path from "path"
import { prisma } from "@/lib/prisma"
import { adminPos, jsonError } from "@/lib/pos/api"
import { dirOnboarding, rutaClientes } from "@/lib/pos/onboarding"

// GET /api/pos-admin/cuentas/:id/onboarding?archivo=clientes|logo — descarga lo que entregó el
// restaurante en el registro (solo ADMIN), para reintentar la importación a mano.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminPos())) return jsonError("No autorizado", 401)
  const { id } = await params
  const archivo = new URL(req.url).searchParams.get("archivo")
  const cuenta = await prisma.posCuenta.findUnique({ where: { id }, select: { id: true, codigo: true, archivoClientes: true, archivoClientesNombre: true } })
  if (!cuenta) return jsonError("No encontrado", 404)

  let ruta: string | null = null
  let tipo = "application/octet-stream"
  let nombre = ""
  if (archivo === "clientes") {
    ruta = rutaClientes(cuenta)
    const xlsx = cuenta.archivoClientes?.endsWith(".xlsx")
    tipo = xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8"
    nombre = `clientes-${cuenta.codigo}.${xlsx ? "xlsx" : "csv"}`
  } else if (archivo === "logo") {
    ruta = path.join(dirOnboarding(cuenta.id), "logo.png")
    tipo = "image/png"
    nombre = `logo-${cuenta.codigo}.png`
  }
  if (!ruta) return jsonError("Archivo no disponible", 404)
  try {
    const buf = await fs.readFile(ruta)
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": tipo,
        "Content-Disposition": `${archivo === "logo" ? "inline" : "attachment"}; filename="${nombre}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    })
  } catch {
    return jsonError("Archivo no disponible", 404)
  }
}
