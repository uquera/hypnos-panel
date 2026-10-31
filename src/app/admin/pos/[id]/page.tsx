import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Braces, ExternalLink } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { urlLogo } from "@/lib/pos/logo"
import { usuarioPublico } from "@/lib/pos/usuarios"
import { includeTablero, filaTablero } from "@/lib/pos/tablero"
import { claveDiaChile, fechaCorta } from "@/lib/pos/fechas"
import { precioMensual, formatoCLP } from "@/lib/pos/config"
import PosMarcaForm from "@/app/_components/pos/PosMarcaForm"
import PosUsuarios from "@/app/_components/pos/PosUsuarios"
import EstadoCuentaButton from "./EstadoCuentaButton"
import FichaGestion from "./FichaGestion"
import LogInstalacion from "./LogInstalacion"
import { EstadoBadge } from "../_components/PosTablero"
import ComprobantesBandeja from "../_components/ComprobantesBandeja"

export const metadata = { title: "Restaurante — Hypnos POS" }
export const dynamic = "force-dynamic"

// Ficha de un restaurante: licencia y cobro, comprobantes, pagos, instalación, marca y usuarios.
export default async function CuentaPosPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const { id } = await params
  const [cuenta, clientes] = await Promise.all([
    prisma.posCuenta.findUnique({ where: { id }, include: includeTablero }),
    prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ])
  if (!cuenta) notFound()

  const [usuarios, comprobantes, pagos] = await Promise.all([
    prisma.posUsuario.findMany({ where: { cuentaId: id }, orderBy: [{ rol: "asc" }, { createdAt: "asc" }] }),
    prisma.posComprobante.findMany({ where: { cuentaId: id }, orderBy: { createdAt: "desc" } }),
    cuenta.clienteId
      ? prisma.pago.findMany({ where: { clienteId: cuenta.clienteId }, orderBy: { fechaPago: "desc" }, include: { registradoPor: { select: { nombre: true } } } })
      : Promise.resolve([]),
  ])

  const fila = filaTablero(cuenta)
  const logoUrl = urlLogo("", cuenta)
  const dueno = usuarios.find(u => u.rol === "DUENO")
  const clp = (n: number, m: string) => m === "CLP" ? formatoCLP(n) : `${m} ${n.toLocaleString("es-CL")}`
  const card = "bg-white rounded-2xl border border-gray-100 shadow-sm"

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/admin/pos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> Hypnos POS
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white border border-gray-100 p-1 shrink-0" />
              : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-lg font-bold shrink-0" style={{ background: cuenta.colorPrimario }}>{cuenta.nombre.charAt(0)}</div>}
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900 truncate">{cuenta.nombre}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                <span>Código <span className="font-mono font-semibold text-gray-700">{cuenta.codigo}</span></span>
                <EstadoBadge f={fila} />
                <span className="text-xs">{cuenta.origen === "REGISTRO" ? "Registro web" : "Creado por Hypnos"} · {fechaCorta(cuenta.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={cuenta.posUrl} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
              <ExternalLink size={13} /> Abrir sistema
            </a>
            <a href={`/api/pos-app/config?code=${cuenta.codigo}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Braces size={13} /> Config de la app
            </a>
            {!cuenta.eliminadaAt && <EstadoCuentaButton id={cuenta.id} activo={cuenta.activo} nombre={cuenta.nombre} />}
          </div>
        </div>
      </div>

      <FichaGestion
        fila={fila}
        datos={{
          nombre: cuenta.nombre,
          dueno: dueno?.nombre ?? "",
          email: dueno?.email ?? cuenta.cliente?.emailContacto ?? "",
          whatsapp: cuenta.whatsapp,
          notas: cuenta.cliente?.notasAdmin ?? "",
          vence: cuenta.cliente ? claveDiaChile(cuenta.cliente.fechaVencimiento) : "",
          precioMensual: cuenta.precioMensual ? String(cuenta.precioMensual) : "",
        }}
        precioGeneral={precioMensual()}
        tieneDueno={!!dueno}
        clienteId={cuenta.clienteId}
      />

      <section id="comprobantes" className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Comprobantes</h2>
        <ComprobantesBandeja comprobantes={comprobantes.map(c => ({
          id: c.id, cuentaId: cuenta.id, restaurante: cuenta.nombre, codigo: cuenta.codigo,
          monto: c.montoDeclarado, mime: c.mime, comentario: c.comentario, subidoPor: c.subidoPor,
          fecha: fechaCorta(c.createdAt), estado: c.estado, motivo: c.motivoRechazo, revisadoPor: c.revisadoPor,
        }))} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Historial de pagos</h2>
        {pagos.length === 0
          ? <p className="text-sm text-gray-400">{cuenta.clienteId ? "Sin pagos registrados." : "Sin licencia en la gobernanza (instalación manual)."}</p>
          : (
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50/50 text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left px-4 py-3 font-semibold">Fecha</th>
                  <th className="text-left px-3 py-3 font-semibold">Monto</th>
                  <th className="text-left px-3 py-3 font-semibold">Período</th>
                  <th className="text-left px-3 py-3 font-semibold">Registró</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {pagos.map(p => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fechaCorta(p.fechaPago)}</td>
                      <td className="px-3 py-2.5 font-semibold whitespace-nowrap">{clp(p.monto, p.moneda)}</td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{p.periodoInicio && p.periodoFin ? `${fechaCorta(p.periodoInicio)} → ${fechaCorta(p.periodoFin)}` : (p.conceptoDetalle ?? p.concepto)}</td>
                      <td className="px-3 py-2.5 text-gray-500">{p.registradoPor.nombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>

      <LogInstalacion
        cuentaId={cuenta.id}
        estadoAlta={cuenta.estadoAlta}
        altaAt={cuenta.altaAt?.toISOString() ?? null}
        log={cuenta.altaLog ?? ""}
        estancada={fila.estancada}
        eliminada={fila.eliminada}
      />

      {!cuenta.eliminadaAt && (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-bold text-gray-900">Marca en la app</h2>
            <PosMarcaForm
              key={cuenta.updatedAt.getTime()}
              modo="editar"
              clientes={clientes}
              cuenta={{
                id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre, posUrl: cuenta.posUrl,
                clienteId: cuenta.clienteId, logoUrl,
                colorPrimario: cuenta.colorPrimario, colorTextoPrimario: cuenta.colorTextoPrimario,
                colorFondo: cuenta.colorFondo, colorTexto: cuenta.colorTexto,
              }}
            />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Usuarios del portal</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Entran en <span className="font-mono text-gray-700">/pos/login</span>: el dueño paga en <span className="font-mono text-gray-700">/pos/pago</span> e invita a su equipo; todos editan la marca.
              </p>
            </div>
            <PosUsuarios modo="admin" cuentaId={cuenta.id} usuarios={usuarios.map(usuarioPublico)} />
          </section>
        </>
      )}
    </div>
  )
}
