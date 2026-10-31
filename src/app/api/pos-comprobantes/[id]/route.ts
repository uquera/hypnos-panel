import { prisma } from "@/lib/prisma"
import { adminPos, jsonError } from "@/lib/pos/api"
import { getSesionPos } from "@/lib/pos/sesion"
import { leerArchivoComprobante } from "@/lib/pos/comprobantes"

// GET /api/pos-comprobantes/:id — archivo del comprobante. Solo Hypnos (ADMIN) o
// una sub-cuenta del mismo negocio. Se sirve con su tipo real y en un sandbox.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const comp = await prisma.posComprobante.findUnique({ where: { id } })
  if (!comp) return jsonError("No encontrado", 404)

  if (!(await adminPos())) {
    const yo = await getSesionPos()
    if (!yo || yo.cuentaId !== comp.cuentaId) return jsonError("No autorizado", 401)
  }

  const buf = await leerArchivoComprobante(comp.archivo)
  if (!buf) return jsonError("Archivo no disponible", 404)
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": comp.mime,
      "Content-Disposition": `inline; filename="comprobante-${comp.id}.${comp.archivo.split(".").pop()}"`,
      "X-Content-Type-Options": "nosniff",
      // El visor de PDF de Chrome no abre dentro de un sandbox; las imágenes sí lo llevan
      ...(comp.mime === "application/pdf" ? {} : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
      "Cache-Control": "private, no-store",
    },
  })
}
