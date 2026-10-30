"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import PosAuthCard, { botonPos, inputPos, labelPos } from "../_components/PosAuthCard"

export default function PosLoginForm() {
  const [form, setForm]         = useState({ email: "", password: "" })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res  = await fetch("/api/pos-portal/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "No se pudo ingresar."); return }
      window.location.href = "/pos/marca"
    } catch {
      toast.error("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <PosAuthCard titulo="Hypnos POS" subtitulo="Administra la marca de tu negocio"
      pie={<span className="text-xs text-gray-400">¿Eres del equipo Hypnos? <Link href="/login" className="text-gray-600 underline">Entra al panel</Link></span>}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="email" className={labelPos}>Correo</label>
          <input id="email" type="email" autoComplete="email" required placeholder="tu@negocio.cl" className={inputPos}
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className={labelPos}>Contraseña</label>
            <Link href="/pos/recuperar" className="text-xs font-medium text-gray-600 hover:text-gray-900">¿Olvidaste tu contraseña?</Link>
          </div>
          <div className="relative">
            <input id="password" type={showPass ? "text" : "password"} autoComplete="current-password" required placeholder="••••••••"
              className={`${inputPos} pr-11`} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShowPass(!showPass)} aria-label="Mostrar contraseña"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className={botonPos}>
          {loading ? <><Loader2 size={16} className="animate-spin" /> Ingresando...</> : "Ingresar"}
        </button>
      </form>
    </PosAuthCard>
  )
}
