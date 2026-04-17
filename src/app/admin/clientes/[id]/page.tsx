import { auth } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { calcularEstado } from "@/lib/licencia-utils"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import SyncLicenciaForm from "./SyncLicenciaForm"
import EditClienteForm from "./EditClienteForm"

export const metadata = { title: "Editar cliente — Hypnos Panel" }

interface Props { params: Promise<{ id: string }> }

export default async function EditarClientePage({ params }: Props) {
  const { id } = await params
  const session = await auth()
  if (!session) redirect("/login")

  const cliente = await prisma.cliente.findUnique({ where: { id } })
  if (!cliente || !cliente.activo) notFound()

  const estado = calcularEstado(cliente)
  const isAdmin = session.user.role === "ADMIN"

  const fechaStr = new Date(cliente.fechaVencimiento).toISOString().split("T")[0]

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

      {/* Sección 2: Datos técnicos — solo ADMIN */}
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

// Botón de archivar — server action inline
import { ArchivarButton } from "./ArchivarButton"
