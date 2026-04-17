import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import PasswordField from "./PasswordField"

export const metadata = { title: "Nuevo cliente — Hypnos Panel" }

async function crearCliente(formData: FormData) {
  "use server"
  const nombre           = formData.get("nombre") as string
  const dominio          = formData.get("dominio") as string
  const apiUrl           = formData.get("apiUrl") as string
  const masterKey        = formData.get("masterKey") as string
  const plan             = formData.get("plan") as string
  const fechaVencimiento = formData.get("fechaVencimiento") as string
  const notasAdmin       = formData.get("notasAdmin") as string

  await prisma.cliente.create({
    data: {
      nombre,
      dominio,
      apiUrl,
      masterKey,
      plan,
      fechaVencimiento: new Date(fechaVencimiento),
      notasAdmin: notasAdmin || null,
    },
  })
  redirect("/admin")
}

export default async function NuevoClientePage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  // Fecha mínima: hoy + 30 días como sugerencia
  const defaultDate = new Date()
  defaultDate.setDate(defaultDate.getDate() + 30)
  const defaultDateStr = defaultDate.toISOString().split("T")[0]

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo cliente</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registrar una nueva instancia SaaS</p>
        </div>
      </div>

      <form action={crearCliente} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre del cliente" name="nombre" placeholder="Centro Bambú" required />
          <Field label="Dominio" name="dominio" placeholder="centrobambu.cl" required />
        </div>

        <Field
          label="URL de la API de gobernanza"
          name="apiUrl"
          placeholder="https://centrobambu.cl/api/gobernanza/licencia"
          required
          hint="Endpoint PATCH que acepta la master key"
        />

        <PasswordField
          name="masterKey"
          placeholder="clave_secreta_de_esa_instancia"
          required
          hint="Variable GOBERNANZA_MASTER_KEY del .env del cliente"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Plan
            </label>
            <select
              name="plan"
              defaultValue="BASICO"
              className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            >
              <option value="BASICO">BASICO</option>
              <option value="PRO">PRO</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </div>
          <Field
            label="Fecha de vencimiento"
            name="fechaVencimiento"
            type="date"
            defaultValue={defaultDateStr}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Notas internas
          </label>
          <textarea
            name="notasAdmin"
            rows={3}
            placeholder="Ej: Pagó con transferencia el 17/04. Vence el 17/05."
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-100">
          <Link
            href="/admin"
            className="flex-1 h-11 flex items-center justify-center rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            className="flex-1 h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
          >
            Crear cliente
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label, name, type = "text", placeholder, required, hint, defaultValue,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
  required?: boolean
  hint?: string
  defaultValue?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
