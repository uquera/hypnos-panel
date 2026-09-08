import { NextRequest, NextResponse } from "next/server"
import { auth, isOwnerEmail } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isOwnerEmail(session.user.email))
    return NextResponse.json({ error: "Solo el owner puede gestionar usuarios" }, { status: 403 })

  const { id } = await params
  const { activo } = await req.json()
  if (typeof activo !== "boolean")
    return NextResponse.json({ error: "Valor de 'activo' inválido" }, { status: 400 })

  // No permitir auto-desactivarse
  if (!activo) {
    const self = await prisma.user.findUnique({ where: { id } })
    if (self && (self.id === session.user.id || self.email === session.user.email))
      return NextResponse.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id },
    data:  { activo },
  })
  return NextResponse.json({ ok: true, user })
}
