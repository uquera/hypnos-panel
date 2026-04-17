import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN")
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { id } = await params
  const { activo } = await req.json()

  const user = await prisma.user.update({
    where: { id },
    data:  { activo },
  })
  return NextResponse.json({ ok: true, user })
}
