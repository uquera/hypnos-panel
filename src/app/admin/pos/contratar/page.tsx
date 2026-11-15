import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCatalogo, leerLineas, mpCheckoutListo } from "@/lib/pos/contratar"
import { basePortal } from "@/lib/pos/servidor"
import { fechaCorta } from "@/lib/pos/fechas"
import { formatoRut } from "@/lib/pos/contratar-calculo"
import ContratarAdmin, { type PedidoFila, type CuponFila, type SolicitudFila, type PartnerFila } from "./ContratarAdmin"

export const metadata = { title: "Contratación online — Hypnos POS" }
export const dynamic = "force-dynamic"

// Contratación online de Hypnos POS (mi.hypnosapps.com/pos/contratar): pedidos con sus tareas
// (cobro, despacho de máquinas, puesta en marcha), cupones y precios.
export default async function ContratarAdminPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")
  const { cuenta } = await searchParams

  const [catalogo, pedidos, cupones, solicitudes, partners] = await Promise.all([
    getCatalogo(),
    prisma.posPedido.findMany({
      where: cuenta ? { cuentaId: cuenta } : {},
      orderBy: { createdAt: "desc" }, take: 200,
      include: { cuenta: { select: { id: true, nombre: true, codigo: true, tipo: true, whatsapp: true, rut: true, razonSocial: true, comuna: true, usuarios: { where: { rol: "DUENO" }, take: 1, select: { nombre: true, email: true } } } } },
    }),
    prisma.posCupon.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.posSolicitudMaquina.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { cuenta: { select: { id: true, nombre: true } } } }),
    prisma.posPartnerLead.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
  ])

  const filas: PedidoFila[] = pedidos.map(p => ({
    id: p.id, fecha: fechaCorta(p.createdAt), estado: p.estado, medio: p.medio, plan: p.plan, cajas: p.cajas,
    total: p.total, descuento: p.descuento, cupon: p.cuponCodigo, lineas: leerLineas(p.items),
    maquinas: p.maquinas, direccionEnvio: p.direccionEnvio, despacho: p.despacho, seriales: p.seriales, marcha: p.marcha,
    notasAdmin: p.notasAdmin, detalle: p.detalle, mpPaymentId: p.mpPaymentId, origen: p.origen,
    cuenta: {
      id: p.cuenta.id, nombre: p.cuenta.nombre, codigo: p.cuenta.codigo, tipo: p.cuenta.tipo, whatsapp: p.cuenta.whatsapp,
      rut: p.cuenta.rut ? formatoRut(p.cuenta.rut) : "", razonSocial: p.cuenta.razonSocial, comuna: p.cuenta.comuna,
      dueno: p.cuenta.usuarios[0]?.nombre ?? "", email: p.cuenta.usuarios[0]?.email ?? "",
    },
  }))
  const cups: CuponFila[] = cupones.map(c => ({
    id: c.id, codigo: c.codigo, tipo: c.tipo as "PORCENTAJE" | "MONTO", valor: c.valor, soloAnual: c.soloAnual,
    venceAt: c.venceAt ? c.venceAt.toISOString().slice(0, 10) : "", usosMax: c.usosMax, usos: c.usos, activo: c.activo, notas: c.notas,
  }))

  const sols: SolicitudFila[] = solicitudes.map(s => ({
    id: s.id, fecha: fechaCorta(s.createdAt), marca: s.marca, rut: formatoRut(s.rut), razonSocial: s.razonSocial,
    nombre: s.nombre, telefono: s.telefono, email: s.email, comuna: s.comuna, estado: s.estado, notas: s.notas, origen: s.origen,
    cuenta: s.cuenta ? { id: s.cuenta.id, nombre: s.cuenta.nombre } : null,
  }))
  const parts: PartnerFila[] = partners.map(l => ({
    id: l.id, fecha: fechaCorta(l.createdAt), tipo: l.tipo, nombre: l.nombre, oficina: l.oficina, rut: l.rut ? formatoRut(l.rut) : "",
    telefono: l.telefono, email: l.email, clientes: l.clientes, estado: l.estado, notas: l.notas, origen: l.origen,
  }))

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/admin/pos" className="text-sm text-gray-500 inline-flex items-center gap-1 hover:text-gray-700"><ArrowLeft size={14} /> Hypnos POS</Link>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mt-1">Contratación online</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pedidos, despachos de máquinas, puestas en marcha, solicitudes de máquina, partners, cupones y precios{cuenta ? " · filtrado por un local" : ""}</p>
        </div>
        <a href={`${basePortal()}/pos/contratar`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 shrink-0">
          Ver página <ExternalLink size={14} />
        </a>
      </div>
      {!mpCheckoutListo() && (
        <p className="text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-800 p-3">Falta MP_ACCESS_TOKEN en el .env del panel: la página solo ofrecerá transferencia.</p>
      )}
      <ContratarAdmin catalogo={catalogo} pedidos={filas} cupones={cups} solicitudes={sols} partners={parts} />
    </div>
  )
}
