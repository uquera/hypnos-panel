import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adminPos, jsonError } from "@/lib/pos/api"
import { correosDe } from "@/lib/pos/cadena"
import { logActividad } from "@/lib/actividad"

export const dynamic = "force-dynamic"

// Cadenas de locales (Mi cadena). Solo Hypnos las crea y edita.
// POST { id?, nombre, correos, cuentaIds[] } crea o actualiza · DELETE ?id= la borra (los locales quedan sueltos).

export async function POST(req: Request) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const b = (await req.json().catch(() => ({}))) as { id?: string; nombre?: string; correos?: string; cuentaIds?: string[] }
  const nombre = String(b.nombre ?? "").trim().slice(0, 80)
  if (!nombre) return jsonError("El nombre es requerido", 400)
  const correos = correosDe(String(b.correos ?? ""))
  if (!correos.length) return jsonError("Agrega al menos un correo de dueño", 400)
  const ids = Array.isArray(b.cuentaIds) ? b.cuentaIds.map(String) : []
  if (ids.length < 2) return jsonError("Una cadena necesita al menos 2 locales", 400)

  // un correo no puede ser dueño de dos cadenas (el portal mostraría solo una)
  const otras = await prisma.posCadena.findMany({ where: b.id ? { id: { not: b.id } } : {}, select: { nombre: true, correos: true } })
  const repetido = correos.find((c) => otras.some((o) => correosDe(o.correos).includes(c)))
  if (repetido) return jsonError(`${repetido} ya es dueño de otra cadena`, 400)

  const data = { nombre, correos: correos.join(",") }
  const cadena = b.id
    ? await prisma.posCadena.update({ where: { id: b.id }, data })
    : await prisma.posCadena.create({ data })
  await prisma.$transaction([
    prisma.posCuenta.updateMany({ where: { cadenaId: cadena.id, id: { notIn: ids } }, data: { cadenaId: null } }),
    prisma.posCuenta.updateMany({ where: { id: { in: ids } }, data: { cadenaId: cadena.id } }),
  ])
  await logActividad({
    usuarioId: session.user.id, usuarioNombre: session.user.name ?? "",
    accion: "POS_CADENA", detalle: `${b.id ? "editó" : "creó"} la cadena ${nombre} (${ids.length} locales)`,
  })
  return NextResponse.json({ ok: true, id: cadena.id })
}

export async function DELETE(req: Request) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return jsonError("Falta la cadena", 400)
  const c = await prisma.posCadena.delete({ where: { id } }).catch(() => null)
  if (!c) return jsonError("Cadena no encontrada", 404)
  await logActividad({ usuarioId: session.user.id, usuarioNombre: session.user.name ?? "", accion: "POS_CADENA", detalle: `borró la cadena ${c.nombre}` })
  return NextResponse.json({ ok: true })
}
