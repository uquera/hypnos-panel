import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { ErrorPos } from "@/lib/pos/usuarios"
import { logActividad } from "@/lib/actividad"
import { guardarCatalogo, marcarPedidoPagado, normalizarCupon, sincronizarPedido } from "@/lib/pos/contratar"
import type { Catalogo } from "@/lib/pos/contratar-calculo"

export const dynamic = "force-dynamic"

// POST /api/pos-admin/contratar — administración de la contratación online (/admin/pos/contratar).
// { accion: "catalogo", catalogo } · { accion: "cupon", id?, codigo, tipo, valor, soloAnual, venceAt, usosMax, activo, notas }
// { accion: "cupon-borrar", id } · { accion: "pedido", id, despacho?, seriales?, marcha?, notasAdmin? }
// { accion: "revisar", id } (relee Mercado Pago) · { accion: "pagado", id, soloAdicionales } (transferencia)
// { accion: "cancelar", id }

const DESPACHO = ["", "POR_DESPACHAR", "DESPACHADA", "ENTREGADA"]
const MARCHA = ["", "POR_AGENDAR", "AGENDADA", "HECHA"]
const n = (v: unknown, min: number, max: number) => {
  const k = Math.round(Number(v))
  if (!Number.isFinite(k) || k < min || k > max) throw new ErrorPos(`Valor fuera de rango (${min} a ${max}).`)
  return k
}

export async function POST(req: Request) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  return manejar(async () => {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const operador = { id: session.user.id, nombre: session.user.name ?? session.user.email ?? "Hypnos" }

    switch (b.accion) {
      case "catalogo": {
        const c = (b.catalogo ?? {}) as Partial<Catalogo>
        const cat: Catalogo = {
          mensualCaja: n(c.mensualCaja, 1000, 1_000_000), anualCaja: n(c.anualCaja, 1000, 10_000_000),
          marcha: n(c.marcha, 0, 5_000_000), point: n(c.point, 1000, 1_000_000),
          cuotas: n(c.cuotas, 1, 12), cuotasSinInteres: !!c.cuotasSinInteres, pointActiva: !!c.pointActiva,
          maxCajas: n(c.maxCajas, 1, 50),
        }
        await guardarCatalogo(cat)
        await logActividad({ usuarioId: operador.id, usuarioNombre: operador.nombre, accion: "POS_CONFIG", detalle: `[Hypnos POS] Precios de contratación: ${JSON.stringify(cat)}` })
        return NextResponse.json({ ok: true, catalogo: cat })
      }
      case "cupon": {
        const codigo = normalizarCupon(b.codigo)
        if (codigo.length < 3) throw new ErrorPos("El código debe tener al menos 3 letras o números.")
        const tipo = b.tipo === "MONTO" ? "MONTO" : "PORCENTAJE"
        const valor = tipo === "PORCENTAJE" ? n(b.valor, 1, 100) : n(b.valor, 100, 10_000_000)
        const venceAt = b.venceAt ? new Date(`${String(b.venceAt).slice(0, 10)}T23:59:59-03:00`) : null
        if (venceAt && isNaN(venceAt.getTime())) throw new ErrorPos("Fecha de vencimiento no válida.")
        const usosMax = b.usosMax === "" || b.usosMax == null ? null : n(b.usosMax, 1, 100_000)
        const data = { codigo, tipo, valor, soloAnual: !!b.soloAnual, venceAt, usosMax, activo: b.activo !== false, notas: String(b.notas ?? "").slice(0, 200) }
        try {
          const cup = b.id
            ? await prisma.posCupon.update({ where: { id: String(b.id) }, data })
            : await prisma.posCupon.create({ data })
          return NextResponse.json({ ok: true, cupon: cup })
        } catch (e) {
          if ((e as { code?: string }).code === "P2002") throw new ErrorPos("Ya existe un cupón con ese código.", 409)
          throw e
        }
      }
      case "cupon-borrar": {
        await prisma.posCupon.delete({ where: { id: String(b.id) } })
        return NextResponse.json({ ok: true })
      }
      case "pedido": {
        const data: Record<string, string> = {}
        if (typeof b.despacho === "string") { if (!DESPACHO.includes(b.despacho)) throw new ErrorPos("Estado de despacho no válido."); data.despacho = b.despacho }
        if (typeof b.marcha === "string") { if (!MARCHA.includes(b.marcha)) throw new ErrorPos("Estado de puesta en marcha no válido."); data.marcha = b.marcha }
        if (typeof b.seriales === "string") data.seriales = b.seriales.slice(0, 300)
        if (typeof b.notasAdmin === "string") data.notasAdmin = b.notasAdmin.slice(0, 1000)
        const p = await prisma.posPedido.update({ where: { id: String(b.id) }, data })
        return NextResponse.json({ ok: true, pedido: p })
      }
      case "revisar": {
        const r = await sincronizarPedido(String(b.id))
        return NextResponse.json({ ok: true, resultado: r })
      }
      case "pagado": {
        await marcarPedidoPagado(String(b.id), operador, !!b.soloAdicionales)
        return NextResponse.json({ ok: true })
      }
      case "cancelar": {
        const r = await prisma.posPedido.updateMany({ where: { id: String(b.id), estado: { in: ["PENDIENTE", "ERROR"] } }, data: { estado: "CANCELADO" } })
        if (r.count === 0) throw new ErrorPos("Solo se cancelan pedidos pendientes.")
        return NextResponse.json({ ok: true })
      }
      default:
        throw new ErrorPos("Acción no válida.")
    }
  })
}
