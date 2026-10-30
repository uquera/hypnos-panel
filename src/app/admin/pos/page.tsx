import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { urlLogo } from "@/lib/pos/logo"
import PosCuentasClient from "./PosCuentasClient"

export const metadata = { title: "Hypnos POS — Hypnos Panel" }
export const dynamic = "force-dynamic"

export default async function PosCuentasPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const cuentas = await prisma.posCuenta.findMany({
    orderBy: { nombre: "asc" },
    include: { cliente: { select: { nombre: true } }, _count: { select: { usuarios: true } } },
  })

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Hypnos POS</h1>
          <p className="text-sm text-gray-500 mt-0.5">Marca de cada negocio en la app de las máquinas TUU Pro 2</p>
        </div>
        <Link href="/admin/pos/nueva"
          className="shrink-0 inline-flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-semibold text-white hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          <Plus size={15} /> <span className="hidden sm:inline">Nueva cuenta</span><span className="sm:hidden">Nueva</span>
        </Link>
      </div>

      <PosCuentasClient cuentas={cuentas.map(c => ({
        id:       c.id,
        codigo:   c.codigo,
        nombre:   c.nombre,
        posUrl:   c.posUrl,
        activo:   c.activo,
        logoUrl:  urlLogo("", c),
        cliente:  c.cliente?.nombre ?? null,
        usuarios: c._count.usuarios,
        colorPrimario: c.colorPrimario,
      }))} />
    </div>
  )
}
