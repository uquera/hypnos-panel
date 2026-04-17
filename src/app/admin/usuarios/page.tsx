import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { UserPlus, ShieldCheck, Briefcase } from "lucide-react"
import ToggleUserButton from "./ToggleUserButton"

export const metadata = { title: "Usuarios — Hypnos Panel" }
export const dynamic = "force-dynamic"

async function crearUsuario(formData: FormData) {
  "use server"
  const nombre       = formData.get("nombre") as string
  const email        = formData.get("email") as string
  const password     = formData.get("password") as string
  const role         = formData.get("role") as string

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({ data: { nombre, email, passwordHash, role } })
  redirect("/admin/usuarios")
}

export default async function UsuariosPage() {
  const session = await auth()
  if (!session || session.user.role !== "ADMIN") redirect("/admin")

  const usuarios = await prisma.user.findMany({ orderBy: { createdAt: "asc" } })

  return (
    <div className="max-w-3xl space-y-6">

      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">Usuarios del panel</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestión de acceso a Hypnos Panel</p>
      </div>

      {/* Cards — móvil */}
      <div className="sm:hidden space-y-3">
        {usuarios.map((u) => (
          <div key={u.id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 ${!u.activo ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{u.nombre}</p>
                <p className="text-xs text-gray-400 mt-0.5">{u.email}</p>
              </div>
              <span className={[
                "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
                u.role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600",
              ].join(" ")}>
                {u.role === "ADMIN"
                  ? <><ShieldCheck size={11} /> Admin</>
                  : <><Briefcase size={11} /> Cobrador</>
                }
              </span>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
              <span className={[
                "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold",
                u.activo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
              ].join(" ")}>
                {u.activo ? "Activo" : "Desactivado"}
              </span>
              {u.email !== session.user.email && (
                <ToggleUserButton userId={u.id} activo={u.activo} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tabla — tablet y desktop */}
      <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Nombre</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Correo</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Rol</th>
              <th className="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Estado</th>
              <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {usuarios.map((u) => (
              <tr key={u.id} className={`transition-colors ${!u.activo ? "opacity-50" : "hover:bg-gray-50/50"}`}>
                <td className="px-5 py-4 font-semibold text-gray-900">{u.nombre}</td>
                <td className="px-4 py-4 text-gray-500">{u.email}</td>
                <td className="px-4 py-4">
                  <span className={[
                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold",
                    u.role === "ADMIN" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600",
                  ].join(" ")}>
                    {u.role === "ADMIN"
                      ? <><ShieldCheck size={11} /> Admin</>
                      : <><Briefcase size={11} /> Cobrador</>
                    }
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={[
                    "inline-flex px-2.5 py-1 rounded-full text-xs font-semibold",
                    u.activo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
                  ].join(" ")}>
                    {u.activo ? "Activo" : "Desactivado"}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  {u.email !== session.user.email && (
                    <ToggleUserButton userId={u.id} activo={u.activo} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Formulario nuevo usuario */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-indigo-500" />
          <h2 className="text-base font-bold text-gray-900">Agregar usuario</h2>
        </div>

        <form action={crearUsuario} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</label>
              <input name="nombre" type="text" required placeholder="Juan Pérez"
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Correo</label>
              <input name="email" type="email" required placeholder="juan@hypnosapps.com"
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contraseña inicial</label>
              <input name="password" type="password" required placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</label>
              <select name="role" defaultValue="COBRADOR"
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors">
                <option value="COBRADOR">Cobrador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
          </div>
          <button type="submit"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 h-11 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
            <UserPlus size={15} />
            Crear usuario
          </button>
        </form>
      </div>
    </div>
  )
}
