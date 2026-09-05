import type { ReactNode } from "react"
import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { calcularEstado } from "@/lib/licencia-utils"
import { toUSD } from "@/lib/monedas"
import Link from "next/link"
import {
  ArrowLeft, CalendarClock, Mail, Wallet, Activity as ActivityIcon,
  Wifi, WifiOff, HelpCircle, History,
} from "lucide-react"
import SyncLicenciaForm from "./SyncLicenciaForm"
import EditClienteForm from "./EditClienteForm"
import PagosSection from "./PagosSection"
import PagoRenovarButton from "./PagoRenovarButton"

export const metadata = { title: "Ficha de cliente — Hypnos Panel" }

interface Props { params: Promise<{ id: string }> }

// ─── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return "hace un momento"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return "hace 1 día"
  if (days < 30) return `hace ${days} días`
  return date.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}
function formatUSD(monto: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(monto)
}
function fechaCorta(d: Date): string {
  return new Date(d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}
const ACCION_LABEL: Record<string, string> = {
  LICENCIA_SYNC:     "Licencia sincronizada",
  PAGO_REGISTRADO:   "Pago registrado",
  RENOVACION:        "Licencia renovada",
  CLIENTE_CREADO:    "Cliente creado",
  CLIENTE_ARCHIVADO: "Cliente archivado",
}

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const cliente = await prisma.cliente.findUnique({ where: { id } })
  if (!cliente || !cliente.activo) notFound()

  const [pagos, actividad] = await Promise.all([
    prisma.pago.findMany({ where: { clienteId: id }, orderBy: { fechaPago: "desc" }, select: { monto: true, moneda: true, fechaPago: true } }),
    prisma.actividadLog.findMany({ where: { clienteId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ])

  const estado = calcularEstado(cliente)
  const isAdmin = session.user.role === "ADMIN"

  const fechaStr = new Date(cliente.fechaVencimiento).toISOString().split("T")[0]
  const diasRestantes = Math.ceil((new Date(cliente.fechaVencimiento).getTime() - Date.now()) / 86_400_000)
  const totalPagado = pagos.reduce((s, p) => s + toUSD(p.monto, p.moneda), 0)
  const ultimoPago = pagos[0]?.fechaPago ?? null

  const salud = cliente.ultimoCheckOk === true
    ? { label: "En línea", cls: "text-green-600", Icon: Wifi }
    : cliente.ultimoCheckOk === false
      ? { label: "Caído", cls: "text-red-600", Icon: WifiOff }
      : { label: "Sin verificar", cls: "text-gray-400", Icon: HelpCircle }

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{cliente.nombre}</h1>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${estado.color} ${estado.textColor}`}>
              {estado.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{cliente.dominio}</p>
        </div>
        <a
          href={`https://${cliente.dominio}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          Ver sitio ↗
        </a>
      </div>

      {/* Resumen — de un vistazo */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
          <Stat icon={<CalendarClock size={15} />} label="Plan / Vencimiento" value={cliente.plan}
            sub={`${fechaCorta(cliente.fechaVencimiento)} · ${diasRestantes > 0 ? `${diasRestantes} días` : "vencida"}`} />
          <Stat icon={<salud.Icon size={15} />} label="Estado del sitio"
            value={<span className={salud.cls}>{salud.label}</span>}
            sub={cliente.ultimoCheck ? `verificado ${timeAgo(cliente.ultimoCheck)}` : "aún no verificado"} />
          <Stat icon={<Wallet size={15} />} label="Total pagado" value={formatUSD(totalPagado)}
            sub={`${pagos.length} pago${pagos.length === 1 ? "" : "s"}${ultimoPago ? ` · último ${fechaCorta(ultimoPago)}` : ""}`} />
          <Stat icon={<Mail size={15} />} label="Contacto" value={cliente.emailContacto || "—"} sub="alertas de vencimiento" mono />
          <Stat icon={<CalendarClock size={15} />} label="Cliente desde" value={fechaCorta(cliente.createdAt)} sub={timeAgo(cliente.createdAt)} />
          <Stat icon={<ActivityIcon size={15} />} label="Actividad" value={`${actividad.length} eventos`} sub="ver historial abajo" />
        </div>
        {cliente.notasAdmin && (
          <div className="mt-5 pt-4 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notas internas</p>
            <p className="text-sm text-gray-600 whitespace-pre-line">{cliente.notasAdmin}</p>
          </div>
        )}
      </div>

      {/* Sección 1: Licencia — TODOS pueden actualizar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Licencia</h2>
          <p className="text-sm text-gray-500">Actualiza plan, fecha de vencimiento y estado de la cuenta</p>
        </div>
        <SyncLicenciaForm
          clienteId={cliente.id}
          dominio={cliente.dominio}
          plan={cliente.plan}
          fechaVencimiento={fechaStr}
          suspendida={cliente.suspendida}
          notasAdmin={cliente.notasAdmin ?? ""}
        />
      </div>

      {/* Sección 2: Historial de pagos — todos */}
      <div className="flex justify-end">
        <PagoRenovarButton clienteId={cliente.id} clienteNombre={cliente.nombre} />
      </div>
      <PagosSection clienteId={cliente.id} isAdmin={isAdmin} />

      {/* Historial de actividad de este cliente */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4">
          <History size={16} className="text-indigo-500" />
          <h2 className="text-base font-bold text-gray-900">Historial de actividad</h2>
        </div>
        {actividad.length === 0 ? (
          <p className="text-sm text-gray-400">Sin actividad registrada todavía.</p>
        ) : (
          <ol className="relative border-l border-gray-100 ml-1.5 space-y-4">
            {actividad.map((log) => (
              <li key={log.id} className="ml-4">
                <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-indigo-400 mt-1.5" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{ACCION_LABEL[log.accion] ?? log.accion}</p>
                    {log.detalle && <p className="text-xs text-gray-500 mt-0.5">{log.detalle}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">por {log.usuarioNombre}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0" title={fechaCorta(log.createdAt)}>{timeAgo(log.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Sección 3: Datos técnicos — solo ADMIN */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">Configuración</h2>
            <p className="text-sm text-gray-500">URL de la API y credenciales de acceso — solo visible para administradores</p>
          </div>
          <EditClienteForm
            clienteId={cliente.id}
            nombre={cliente.nombre}
            dominio={cliente.dominio}
            apiUrl={cliente.apiUrl}
            masterKey={cliente.masterKey}
            emailContacto={cliente.emailContacto}
          />
        </div>
      )}

      {/* Zona de peligro — solo ADMIN */}
      {isAdmin && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-red-700 mb-1">Zona de peligro</h2>
          <p className="text-sm text-gray-500 mb-4">
            Archivar el cliente lo oculta del panel sin borrar sus datos. No afecta el servidor del cliente.
          </p>
          <ArchivarButton clienteId={cliente.id} />
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value, sub, mono }: {
  icon: ReactNode
  label: string
  value: ReactNode
  sub?: string
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-gray-400 mb-1">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-sm font-bold text-gray-900 truncate ${mono ? "font-mono text-[13px]" : ""}`}
        title={typeof value === "string" ? value : undefined}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// Botón de archivar — server action inline
import { ArchivarButton } from "./ArchivarButton"
