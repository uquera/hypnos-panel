import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { requireSesionPos } from "@/lib/pos/sesion"
import { usuarioPublico } from "@/lib/pos/usuarios"
import PosUsuarios from "@/app/_components/pos/PosUsuarios"

export const metadata = { title: "Equipo — Mi Hypnos" }
export const dynamic = "force-dynamic"

// Solo el DUENO: invita y desactiva a los EDITOR de su cuenta.
export default async function PosEquipoPage() {
  const yo = await requireSesionPos()
  if (yo.rol !== "DUENO") redirect("/pos/inicio")

  const usuarios = await prisma.posUsuario.findMany({
    where: { cuentaId: yo.cuentaId },
    orderBy: [{ rol: "asc" }, { createdAt: "asc" }],
  })

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Equipo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Personas que pueden editar la marca de {yo.cuenta.nombre}</p>
      </div>
      <PosUsuarios modo="portal" usuarios={usuarios.map(usuarioPublico)} yoId={yo.id} />
    </div>
  )
}
