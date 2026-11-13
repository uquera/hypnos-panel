import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ShieldCheck, UserRound } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { urlLogo } from "@/lib/pos/logo"
import { usuarioPublico } from "@/lib/pos/usuarios"
import { includeTablero, filaTablero } from "@/lib/pos/tablero"
import { claveDiaChile, fechaCorta } from "@/lib/pos/fechas"
import { precioMensual, formatoCLP } from "@/lib/pos/config"
import { dirOnboarding, leerResultadoAlta } from "@/lib/pos/onboarding"
import fs from "fs/promises"
import path from "path"
import PosMarcaForm from "@/app/_components/pos/PosMarcaForm"
import PosUsuarios from "@/app/_components/pos/PosUsuarios"
import EstadoCuentaButton from "./EstadoCuentaButton"
import FichaGestion from "./FichaGestion"
import LogInstalacion from "./LogInstalacion"
import { EstadoBadge } from "../_components/PosTablero"
import ComprobantesBandeja from "../_components/ComprobantesBandeja"
import { linkPagoOnline } from "@/lib/pos/cobro-online"

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

  const [usuarios, comprobantes, pagos, integrantes, cobrosOnline] = await Promise.all([
    prisma.posUsuario.findMany({ where: { cuentaId: id }, orderBy: [{ rol: "asc" }, { createdAt: "asc" }] }),
    prisma.posComprobante.findMany({ where: { cuentaId: id }, orderBy: { createdAt: "desc" } }),
    cuenta.clienteId
      ? prisma.pago.findMany({ where: { clienteId: cuenta.clienteId }, orderBy: { fechaPago: "desc" }, include: { registradoPor: { select: { nombre: true } } } })
      : Promise.resolve([]),
    // Posibles custodios del ingreso: los integrantes activos del panel
    prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    prisma.posCobroOnline.findMany({ where: { cuentaId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])
  // link de pago en línea (TUU) para enviar por WhatsApp/correo: renueva solo con el callback
  const linkOnline = cuenta.clienteId && !cuenta.eliminadaAt ? linkPagoOnline(cuenta.id) : null

  const fila = filaTablero(cuenta)
  const resultado = leerResultadoAlta(cuenta.resultadoAlta)
  const tieneLogoOnb = await fs.access(path.join(dirOnboarding(cuenta.id), "logo.png")).then(() => true, () => false)
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
            {!cuenta.eliminadaAt && cuenta.estadoAlta === "LISTO" && (
              <form action={`/api/pos-admin/cuentas/${cuenta.id}/soporte`} method="post" target="_blank">
                <button type="submit" title="Entra al sistema del local como Hypnos (soporte), con permisos de administrador"
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700">
                  <ShieldCheck size={13} /> Entrar como admin
                </button>
              </form>
            )}
            {!cuenta.eliminadaAt && dueno && (
              <form action={`/api/pos-admin/cuentas/${cuenta.id}/portal`} method="post" target="_blank">
                <button type="submit" title={`Abre mi.hypnosapps.com como ${dueno.email} (modo soporte, 4 horas)`}
                  className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100">
                  <UserRound size={13} /> Ver portal como dueño
                </button>
              </form>
            )}
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
          menuUrl: cuenta.menuUrl, mesas: String(cuenta.mesas), direccion: cuenta.direccion, horario: cuenta.horario,
        }}
        precioGeneral={precioMensual()}
        tieneDueno={!!dueno}
        clienteId={cuenta.clienteId}
        integrantes={integrantes}
        yoId={session.user.id ?? ""}
      />

      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Entregado en el registro</h2>
        <div className={`${card} p-4 grid sm:grid-cols-2 gap-4 text-sm`}>
          <div className="flex items-start gap-3">
            {tieneLogoOnb
              // eslint-disable-next-line @next/next/no-img-element
              ? <a href={`/api/pos-admin/cuentas/${cuenta.id}/onboarding?archivo=logo`} target="_blank" rel="noreferrer"><img src={`/api/pos-admin/cuentas/${cuenta.id}/onboarding?archivo=logo`} alt="Logo" className="w-14 h-14 rounded-xl object-contain bg-gray-50 border border-gray-100 p-1" /></a>
              : <div className="w-14 h-14 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-[10px] text-gray-400 text-center">Sin logo</div>}
            <div className="min-w-0 space-y-1">
              <p className="text-gray-500 text-xs uppercase font-semibold tracking-wide">Menú online</p>
              {cuenta.menuUrl
                ? <a href={cuenta.menuUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">{cuenta.menuUrl}</a>
                : <p className="text-gray-400">Sin link (carta de ejemplo)</p>}
              {resultado.menu && (
                <p className={resultado.menu.ok ? "text-green-700" : "text-amber-700"}>
                  {resultado.menu.ok ? `Importados ${resultado.menu.productos ?? 0} productos` : `No se importó${resultado.menu.error ? `: ${resultado.menu.error}` : ""}`}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-gray-500 text-xs uppercase font-semibold tracking-wide">Clientes</p>
            {cuenta.archivoClientes
              ? <a href={`/api/pos-admin/cuentas/${cuenta.id}/onboarding?archivo=clientes`} className="text-indigo-600 hover:underline break-all">Descargar {cuenta.archivoClientesNombre || cuenta.archivoClientes}</a>
              : <p className="text-gray-400">No subió archivo</p>}
            {resultado.clientes && (
              <p className={resultado.clientes.ok ? "text-green-700" : "text-amber-700"}>
                {resultado.clientes.ok ? `Importados ${resultado.clientes.importados ?? 0} clientes` : `No se importaron${resultado.clientes.error ? `: ${resultado.clientes.error}` : ""}`}
              </p>
            )}
            <p className="text-gray-600 pt-1">{cuenta.mesas} mesas{cuenta.horario ? ` · ${cuenta.horario}` : ""}</p>
            {cuenta.direccion && <p className="text-gray-500">{cuenta.direccion}</p>}
          </div>
        </div>
      </section>

      {(linkOnline || cobrosOnline.length > 0) && (
        <section id="pago-online" className="space-y-3">
          <h2 className="text-base font-bold text-gray-900">Pago en línea (TUU)</h2>
          <div className={`${card} p-4 space-y-3 text-sm`}>
            {linkOnline && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Link de pago del restaurante</p>
                <p className="mt-1 font-mono text-xs break-all bg-gray-50 border border-gray-100 rounded-lg p-2 select-all">{linkOnline}</p>
                <p className="mt-1 text-xs text-gray-400">Envíalo por WhatsApp: el dueño elige mes o año, paga con Webpay y la licencia se renueva sola.</p>
              </div>
            )}
            {cobrosOnline.length > 0 && (
              <ul className="divide-y divide-gray-50">
                {cobrosOnline.map(c => (
                  <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500">{c.referencia}{c.ambiente === "test" ? " · prueba" : ""}</span>
                    <span className="text-gray-700">{formatoCLP(c.monto)} · {c.meses === 1 ? "1 mes" : `${c.meses} meses`}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.estado === "PAGADO" ? "bg-green-50 text-green-700" : c.estado === "ERROR" ? "bg-red-50 text-red-700" : c.estado === "FALLIDO" ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700"}`}>
                      {c.estado === "PAGADO" ? `Pagado${c.hasta ? ` · hasta ${fechaCorta(c.hasta)}` : ""}` : c.estado === "ERROR" ? "Pagado, sin aplicar" : c.estado === "FALLIDO" ? "Fallido" : "Pendiente"}
                    </span>
                    <span className="text-xs text-gray-400">{fechaCorta(c.createdAt)}</span>
                    {c.detalle && <p className="w-full text-xs text-red-600">{c.detalle}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

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

      {/* El registro de la instalación solo hace falta mientras instala o si falló */}
      {cuenta.estadoAlta !== "LISTO" && cuenta.estadoAlta !== "MANUAL" && <LogInstalacion
        cuentaId={cuenta.id}
        estadoAlta={cuenta.estadoAlta}
        altaAt={cuenta.altaAt?.toISOString() ?? null}
        log={cuenta.altaLog ?? ""}
        estancada={fila.estancada}
        eliminada={fila.eliminada}
      />}

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
