import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import CadenasEditor from "./CadenasEditor"

export const metadata = { title: "Cadenas — Hypnos POS" }
export const dynamic = "force-dynamic"

// Cadenas de locales: un dueño con varios restaurantes ve "Mi cadena" en el portal (incluido, sin costo).
export default async function CadenasPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")
  const [cadenas, cuentas] = await Promise.all([
    prisma.posCadena.findMany({ orderBy: { nombre: "asc" }, include: { cuentas: { select: { id: true } } } }),
    prisma.posCuenta.findMany({
      where: { eliminadaAt: null },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, codigo: true, cadenaId: true, estadoAlta: true, usuarios: { where: { rol: "DUENO" }, select: { email: true }, take: 3 } },
    }),
  ])
  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <Link href="/admin/pos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={14} /> Hypnos POS</Link>
        <h1 className="mt-1 text-xl lg:text-2xl font-bold text-gray-900">Cadenas de locales</h1>
        <p className="text-sm text-gray-500">
          Agrupa los restaurantes de un mismo dueño. Los correos de la cadena ven «Mi cadena» en su portal: ventas de todos los locales sumadas,
          comparación, Excel y entrada directa a cada local (su correo debe existir como usuario en cada sistema).
        </p>
      </div>
      <CadenasEditor
        cadenas={cadenas.map((c) => ({ id: c.id, nombre: c.nombre, correos: c.correos, cuentaIds: c.cuentas.map((x) => x.id) }))}
        cuentas={cuentas.map((c) => ({ id: c.id, nombre: c.nombre, codigo: c.codigo, cadenaId: c.cadenaId, duenos: c.usuarios.map((u) => u.email), listo: c.estadoAlta === "LISTO" }))}
      />
    </div>
  )
}
