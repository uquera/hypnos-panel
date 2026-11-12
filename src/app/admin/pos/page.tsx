import Link from "next/link"
import { redirect } from "next/navigation"
import { Network, Plus, Store } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { includeTablero, filaTablero } from "@/lib/pos/tablero"
import { formatoCLP } from "@/lib/pos/config"
import { claveDiaChile, fechaCorta } from "@/lib/pos/fechas"
import PosTablero from "./_components/PosTablero"
import ComprobantesBandeja, { type ComprobanteFila } from "./_components/ComprobantesBandeja"
import LinksPago from "./_components/LinksPago"
import { getLinksPago, mesesDePago } from "@/lib/pos/links-pago"
import { precioDe } from "@/lib/pos/cobro"

export const metadata = { title: "Hypnos POS — Hypnos Panel" }
export const dynamic = "force-dynamic"

// Centro de gestión de Hypnos POS: restaurantes, estado de licencia, cobros y comprobantes.
export default async function PosCuentasPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const [cuentas, pendientes, linksPago] = await Promise.all([
    prisma.posCuenta.findMany({ orderBy: { createdAt: "desc" }, include: includeTablero }),
    prisma.posComprobante.findMany({
      where: { estado: "PENDIENTE" }, orderBy: { createdAt: "asc" },
      include: { cuenta: { select: { id: true, nombre: true, codigo: true, precioMensual: true } } },
    }),
    getLinksPago(),
  ])
  const filas = cuentas.map(filaTablero)
  // Los archivados salen del tablero y de los totales (ver PosTablero)
  const vivas = filas.filter(f => !f.eliminada && !f.archivada)

  // Resumen
  const mesActual = claveDiaChile(new Date()).slice(0, 7)
  const activos   = vivas.filter(f => ["AL_DIA", "POR_VENCER"].includes(f.estado))
  const enPrueba  = vivas.filter(f => f.estado === "EN_PRUEBA")
  const mrr       = activos.reduce((s, f) => s + f.precio, 0)
  const porCobrar = vivas
    .filter(f => f.tieneLicencia && !f.suspendida && f.venceDia && (f.venceDia.slice(0, 7) <= mesActual))
    .filter(f => f.estado !== "INSTALANDO" && f.estado !== "ERROR")
  const porCobrarMonto = porCobrar.reduce((s, f) => s + f.precio, 0)

  const bandeja: ComprobanteFila[] = await Promise.all(pendientes.map(async c => ({
    // anual u otra opción de varios meses: se sugiere al aprobar
    mesesSugeridos: await mesesDePago(precioDe(c.cuenta), c.montoDeclarado),
    id: c.id, cuentaId: c.cuenta.id, restaurante: c.cuenta.nombre, codigo: c.cuenta.codigo,
    monto: c.montoDeclarado, mime: c.mime, comentario: c.comentario, subidoPor: c.subidoPor,
    fecha: fechaCorta(c.createdAt), estado: c.estado, motivo: c.motivoRechazo, revisadoPor: c.revisadoPor,
  })))

  const stats = [
    { label: "Restaurantes activos", valor: String(activos.length), nota: "pagados y al día" },
    { label: "En prueba", valor: String(enPrueba.length), nota: "prueba gratis vigente" },
    { label: "Ingreso mensual recurrente", valor: formatoCLP(mrr), nota: "activos × precio" },
    { label: "Por cobrar este mes", valor: formatoCLP(porCobrarMonto), nota: `${porCobrar.length} restaurante${porCobrar.length === 1 ? "" : "s"}` },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Hypnos POS</h1>
          <p className="text-sm text-gray-500 mt-0.5">Restaurantes, licencias, cobros y marca de la app</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/admin/pos/cadenas" title="Dueños con varios locales: vista Mi cadena"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Network size={15} /> Cadenas
          </Link>
          <Link href="/admin/pos/nueva" title="Cuenta de marca sin instalación (sistema propio)"
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Plus size={15} /> Cuenta manual
          </Link>
          <Link href="/admin/pos/crear"
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-semibold text-white hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
            <Store size={15} /> <span className="hidden sm:inline">Crear restaurante</span><span className="sm:hidden">Crear</span>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 mt-1">{s.valor}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.nota}</p>
          </div>
        ))}
      </div>

      {bandeja.length > 0 && (
        <section id="comprobantes" className="space-y-3">
          <h2 className="text-base font-bold text-gray-900">Comprobantes por revisar <span className="ml-1 inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-full bg-amber-100 text-amber-800 text-xs">{bandeja.length}</span></h2>
          <ComprobantesBandeja comprobantes={bandeja} mostrarRestaurante />
        </section>
      )}

      <PosTablero filas={filas} />

      <LinksPago inicial={linksPago} enUso={vivas.reduce<Record<string, number>>((m, f) => { m[String(f.precio)] = (m[String(f.precio)] ?? 0) + 1; return m }, {})} />
    </div>
  )
}
