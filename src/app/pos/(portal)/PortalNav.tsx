"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CreditCard, LogOut, Palette, Users } from "lucide-react"

export default function PortalNav({ nombre, esDueno }: { nombre: string; esDueno: boolean }) {
  const pathname = usePathname()
  const items = [
    { href: "/pos/marca", label: "Marca", icon: Palette },
    ...(esDueno ? [
      { href: "/pos/pago", label: "Pago", icon: CreditCard },
      { href: "/pos/equipo", label: "Equipo", icon: Users },
    ] : []),
  ]

  async function salir() {
    await fetch("/api/pos-portal/logout", { method: "POST" }).catch(() => null)
    window.location.href = "/pos/login"
  }

  return (
    <nav className="flex items-center gap-1 shrink-0">
      {items.map(i => {
        const activo = pathname.startsWith(i.href)
        return (
          <Link key={i.href} href={i.href}
            className={["inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors",
              activo ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"].join(" ")}>
            <i.icon size={15} /> <span className="hidden sm:inline">{i.label}</span>
          </Link>
        )
      })}
      <button type="button" onClick={salir} title={`Cerrar sesión de ${nombre}`}
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
        <LogOut size={15} /> <span className="hidden sm:inline">Salir</span>
      </button>
    </nav>
  )
}
