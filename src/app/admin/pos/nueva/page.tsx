import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import PosMarcaForm from "@/app/_components/pos/PosMarcaForm"

export const metadata = { title: "Nueva cuenta POS — Hypnos Panel" }
export const dynamic = "force-dynamic"

export default async function NuevaCuentaPosPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const clientes = await prisma.cliente.findMany({ where: { activo: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } })

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/admin/pos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> Hypnos POS
        </Link>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mt-2">Nueva cuenta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Después podrás invitar al dueño para que edite su marca</p>
      </div>
      <PosMarcaForm modo="crear" clientes={clientes} />
    </div>
  )
}
