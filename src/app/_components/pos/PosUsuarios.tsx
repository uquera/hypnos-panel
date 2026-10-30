"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Mail, Power, Trash2, UserPlus, Crown, Pencil } from "lucide-react"
import type { UsuarioPosPublico } from "@/lib/pos/usuarios"

// Sub-cuentas de una cuenta de Hypnos POS.
//  - modo "admin": Hypnos invita DUENO o EDITOR, reenvía, activa/desactiva y elimina.
//  - modo "portal": el DUENO invita EDITOR, reenvía y activa/desactiva a sus EDITOR.

interface Props {
  modo:      "admin" | "portal"
  cuentaId?: string            // requerido en modo admin
  usuarios:  UsuarioPosPublico[]
  yoId?:     string            // en el portal, para no mostrarse acciones sobre sí mismo
}

const input = "w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"

const ESTADO: Record<UsuarioPosPublico["estado"], { label: string; cls: string }> = {
  ACTIVO:      { label: "Activo",      cls: "bg-green-100 text-green-700" },
  INVITADO:    { label: "Invitado",    cls: "bg-amber-100 text-amber-700" },
  DESACTIVADO: { label: "Desactivado", cls: "bg-red-100 text-red-700" },
}

function fecha(iso: string | null) {
  if (!iso) return "Nunca"
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" })
}

export default function PosUsuarios({ modo, cuentaId, usuarios, yoId }: Props) {
  const router = useRouter()
  const base   = modo === "admin" ? "/api/pos-admin" : "/api/pos-portal"
  const [form, setForm]         = useState({ nombre: "", email: "", rol: modo === "admin" && usuarios.length === 0 ? "DUENO" : "EDITOR" })
  const [enviando, setEnviando] = useState(false)
  const [ocupado, setOcupado]   = useState<string | null>(null)

  async function llamar(url: string, init: RequestInit, ok: string) {
    try {
      const res  = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "No se pudo completar."); return null }
      if (data.enviado === false) toast.warning("Usuario creado, pero el correo no salió. Usa «Reenviar».")
      else toast.success(ok)
      router.refresh()
      return data
    } catch {
      toast.error("Error de red. Intenta de nuevo.")
      return null
    }
  }

  async function invitar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const url  = modo === "admin" ? `${base}/cuentas/${cuentaId}/usuarios` : `${base}/usuarios`
    const data = await llamar(url, { method: "POST", body: JSON.stringify(form) }, `Invitación enviada a ${form.email}`)
    if (data) setForm({ nombre: "", email: "", rol: "EDITOR" })
    setEnviando(false)
  }

  async function accion(u: UsuarioPosPublico, tipo: "reenviar" | "toggle" | "eliminar") {
    if (tipo === "eliminar" && !confirm(`¿Eliminar a ${u.nombre} (${u.email})? Ya no podrá entrar.`)) return
    setOcupado(u.id + tipo)
    if (tipo === "reenviar") {
      await llamar(`${base}/usuarios/${u.id}/reenviar`, { method: "POST" }, `Invitación reenviada a ${u.email}`)
    } else if (tipo === "toggle") {
      const activo = u.estado === "DESACTIVADO"
      await llamar(`${base}/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify({ activo }) },
        activo ? `${u.nombre} puede volver a entrar` : `${u.nombre} ya no puede entrar`)
    } else {
      await llamar(`${base}/usuarios/${u.id}`, { method: "DELETE" }, `${u.nombre} eliminado`)
    }
    setOcupado(null)
  }

  const puedeGestionar = (u: UsuarioPosPublico) => modo === "admin" || (u.rol === "EDITOR" && u.id !== yoId)

  return (
    <div className="space-y-4">
      {usuarios.length === 0 ? (
        <p className="text-sm text-gray-400 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          Todavía no hay sub-cuentas. Invita al dueño del negocio para que edite su marca.
        </p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
          {usuarios.map(u => (
            <div key={u.id} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${u.estado === "DESACTIVADO" ? "opacity-60" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-gray-900 text-sm">{u.nombre}</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${u.rol === "DUENO" ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                    {u.rol === "DUENO" ? <><Crown size={10} /> Dueño</> : <><Pencil size={10} /> Editor</>}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${ESTADO[u.estado].cls}`}>{ESTADO[u.estado].label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{u.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">Último ingreso: {fecha(u.ultimoIngreso)}</p>
              </div>
              {puedeGestionar(u) && (
                <div className="flex flex-wrap gap-1.5 shrink-0">
                  {u.estado !== "DESACTIVADO" && (
                    <button type="button" disabled={!!ocupado} onClick={() => accion(u, "reenviar")}
                      title={u.estado === "INVITADO" ? "Reenviar invitación" : "Enviar enlace para crear una contraseña nueva"}
                      className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                      {ocupado === u.id + "reenviar" ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                      {u.estado === "INVITADO" ? "Reenviar" : "Enlace"}
                    </button>
                  )}
                  <button type="button" disabled={!!ocupado} onClick={() => accion(u, "toggle")}
                    className={`inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-semibold border disabled:opacity-50 ${u.estado === "DESACTIVADO" ? "border-green-200 text-green-700 hover:bg-green-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    <Power size={12} /> {u.estado === "DESACTIVADO" ? "Activar" : "Desactivar"}
                  </button>
                  {modo === "admin" && (
                    <button type="button" disabled={!!ocupado} onClick={() => accion(u, "eliminar")}
                      className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 size={12} /> Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invitar */}
      <form onSubmit={invitar} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus size={17} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-900">Invitar por correo</h3>
        </div>
        <div className={`grid grid-cols-1 gap-3 ${modo === "admin" ? "sm:grid-cols-[1fr_1fr_auto]" : "sm:grid-cols-2"}`}>
          <input className={input} placeholder="Nombre" required maxLength={80}
            value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
          <input className={input} type="email" placeholder="correo@negocio.cl" required maxLength={180}
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          {modo === "admin" && (
            <select className={input} value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value })}>
              <option value="DUENO">Dueño</option>
              <option value="EDITOR">Editor</option>
            </select>
          )}
        </div>
        <p className="text-xs text-gray-400">
          {modo === "admin"
            ? "El dueño edita la marca e invita a su equipo; el editor solo edita la marca. El enlace vence en 7 días."
            : "Los editores pueden cambiar el logo, los colores y el nombre. El enlace vence en 7 días."}
        </p>
        <button type="submit" disabled={enviando}
          className="flex items-center justify-center gap-2 w-full sm:w-auto px-5 h-10 rounded-xl text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)" }}>
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          {enviando ? "Enviando..." : "Enviar invitación"}
        </button>
      </form>
    </div>
  )
}
