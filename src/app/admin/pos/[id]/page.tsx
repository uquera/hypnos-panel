import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Braces } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { urlLogo } from "@/lib/pos/logo"
import { usuarioPublico } from "@/lib/pos/usuarios"
import PosMarcaForm from "@/app/_components/pos/PosMarcaForm"
import PosUsuarios from "@/app/_components/pos/PosUsuarios"
import EstadoCuentaButton from "./EstadoCuentaButton"

export const metadata = { title: "Cuenta POS — Hypnos Panel" }
export const dynamic = "force-dynamic"

export default async function CuentaPosPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const { id } = await params
  const [cuenta, clientes] = await Promise.all([
    prisma.posCuenta.findUnique({ where: { id }, include: { usuarios: { orderBy: [{ rol: "asc" }, { createdAt: "asc" }] } } }),
    prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
  ])
  if (!cuenta) notFound()

  const logoUrl = urlLogo("", cuenta)

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
              <p className="text-sm text-gray-500">
                Código <span className="font-mono font-semibold text-gray-700">{cuenta.codigo}</span>
                {!cuenta.activo && <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Suspendida</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/pos-app/config?code=${cuenta.codigo}`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Braces size={13} /> Ver config de la app
            </a>
            <EstadoCuentaButton id={cuenta.id} activo={cuenta.activo} nombre={cuenta.nombre} />
          </div>
        </div>
      </div>

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

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Sub-cuentas del negocio</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Entran en <span className="font-mono text-gray-700">/pos/login</span> y solo pueden editar el logo, los colores y el nombre de esta cuenta.
          </p>
        </div>
        <PosUsuarios modo="admin" cuentaId={cuenta.id} usuarios={cuenta.usuarios.map(usuarioPublico)} />
      </section>
    </div>
  )
}
