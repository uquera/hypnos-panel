import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores pueden eliminar pagos" }, { status: 403 })
  }

  const { id } = await params
  const pago = await prisma.pago.findUnique({ where: { id } })
  if (!pago) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })

  if (pago.comprobante) {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, pago.comprobante))
    } catch {
      // File might already be missing — continue
    }
  }

  await prisma.pago.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
