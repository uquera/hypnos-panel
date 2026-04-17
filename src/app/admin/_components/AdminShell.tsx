"use client"

import { useState } from "react"
import { Menu, ShieldCheck } from "lucide-react"
import AdminSidebar from "./AdminSidebar"

interface Props {
  role:     string
  userName: string
  children: React.ReactNode
}

export default function AdminShell({ role, userName, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Sidebar — siempre visible en lg+ */}
      <div className="hidden lg:flex shrink-0">
        <AdminSidebar role={role} userName={userName} />
      </div>

      {/* Overlay móvil */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar deslizable en móvil */}
      <div className={[
        "fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-200 ease-in-out",
        open ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}>
        <AdminSidebar role={role} userName={userName} onClose={() => setOpen(false)} />
      </div>

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar — solo en móvil/tablet */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 shrink-0 shadow-sm">
          <button
            onClick={() => setOpen(true)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}
            >
              <ShieldCheck size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900">Hypnos Panel</span>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
