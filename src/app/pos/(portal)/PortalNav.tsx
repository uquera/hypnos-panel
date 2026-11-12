"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CreditCard, ExternalLink, Home, LogOut, Network, Palette, Users } from "lucide-react"

export default function PortalNav({ nombre, esDueno, conSistema, conCadena = false }: { nombre: string; esDueno: boolean; conSistema: boolean; conCadena?: boolean }) {
  const pathname = usePathname()
  const items = [
    { href: "/pos/inicio", label: "Inicio", icon: Home },
    ...(conCadena ? [{ href: "/pos/cadena", label: "Mi cadena", icon: Network }] : []),
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
    <nav className="flex items-center gap-0.5 sm:gap-1 shrink-0">
      {items.map(i => {
        const activo = pathname.startsWith(i.href)
        return (
          <Link key={i.href} href={i.href}
            className={["inline-flex items-center gap-1.5 px-2.5 sm:px-3 h-9 rounded-lg text-sm font-medium transition-colors",
              activo ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"].join(" ")}>
            <i.icon size={15} /> <span className="hidden sm:inline">{i.label}</span>
          </Link>
        )
      })}
      {conSistema && (
        <a href="/api/pos-portal/abrir" target="_blank" rel="noopener" title="Abrir mi sistema"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 h-9 rounded-lg text-sm font-semibold text-white bg-[#f26522] hover:opacity-90 transition">
          <ExternalLink size={15} /> <span className="hidden sm:inline">Abrir sistema</span>
        </a>
      )}
      <button type="button" onClick={salir} title={`Cerrar sesión de ${nombre}`}
        className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 h-9 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors">
        <LogOut size={15} /> <span className="hidden sm:inline">Salir</span>
      </button>
    </nav>
  )
}
