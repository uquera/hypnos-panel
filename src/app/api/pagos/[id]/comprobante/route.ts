import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import path from "path"
import fs from "fs/promises"

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "comprobantes")

const CONTENT_TYPES: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const pago = await prisma.pago.findUnique({ where: { id } })
  if (!pago || !pago.comprobante) {
    return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })
  }

  try {
    const filePath = path.join(UPLOAD_DIR, pago.comprobante)
    const buffer = await fs.readFile(filePath)
    const ext = path.extname(pago.comprobante).toLowerCase()
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${pago.comprobante}"`,
      },
    })
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en el servidor" }, { status: 404 })
  }
}
