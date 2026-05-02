"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  LayoutDashboard,
  UserCog,
  LogOut,
  ShieldCheck,
  X,
  CreditCard,
} from "lucide-react"

interface NavItem {
  href:    string
  label:   string
  icon:    React.ComponentType<{ size?: number }>
  exact?:  boolean
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: "/admin",           label: "Clientes",  icon: LayoutDashboard, exact: true },
  { href: "/admin/pagos",     label: "Pagos",     icon: CreditCard },
  { href: "/admin/usuarios",  label: "Usuarios",  icon: UserCog, adminOnly: true },
]

interface Props {
  role:      string
  userName:  string
  onClose?:  () => void
}

export default function AdminSidebar({ role, userName, onClose }: Props) {
  const pathname = usePathname()
  const isAdmin  = role === "ADMIN"

  const visible = navItems.filter(i => !i.adminOnly || isAdmin)

  return (
    <aside className="w-56 bg-white border-r border-gray-100 flex flex-col h-screen shrink-0 shadow-sm">

      {/* Logo */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
            <ShieldCheck size={16} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900 leading-none">Hypnos</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">Panel</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Cerrar menú"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {visible.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
              ].join(" ")}
              style={active ? { background: "linear-gradient(135deg, #6366f1, #4f46e5)" } : undefined}
            >
              <item.icon size={16} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer: usuario + perfil + logout */}
      <div className="p-3 border-t border-gray-100 space-y-1">
        <Link
          href="/admin/perfil"
          className={[
            "flex items-center gap-2.5 px-3 py-2 w-full rounded-lg transition-all",
            pathname === "/admin/perfil"
              ? "text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
          ].join(" ")}
          style={pathname === "/admin/perfil" ? { background: "linear-gradient(135deg, #6366f1, #4f46e5)" } : undefined}
        >
          <div className={[
            "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
            pathname === "/admin/perfil" ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-600",
          ].join(" ")}>
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate leading-none">{userName}</p>
            <p className={[
              "text-xs leading-none mt-0.5",
              pathname === "/admin/perfil" ? "text-white/70" : "text-gray-400",
            ].join(" ")}>
              {isAdmin ? "Administrador" : "Cobrador"}
            </p>
          </div>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
        >
          <LogOut size={16} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
