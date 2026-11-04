"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2 } from "lucide-react"
import { botonPos, inputPos, labelPos } from "../_components/PosAuthCard"

export default function CrearContrasenaForm({ token, email, invitacion }: { token: string; email: string; invitacion: boolean }) {
  const [password, setPassword] = useState("")
  const [repetir, setRepetir]   = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error("La contraseña debe tener al menos 8 caracteres."); return }
    if (password !== repetir) { toast.error("Las contraseñas no coinciden."); return }
    setLoading(true)
    try {
      const res  = await fetch("/api/pos-portal/crear-contrasena", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? "No se pudo guardar."); return }
      toast.success("Contraseña lista")
      window.location.href = "/pos/inicio"
    } catch {
      toast.error("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* El correo ayuda a los gestores de contraseñas a guardar la cuenta correcta */}
      <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
      <div className="space-y-1.5">
        <label htmlFor="password" className={labelPos}>Contraseña</label>
        <div className="relative">
          <input id="password" type={showPass ? "text" : "password"} autoComplete="new-password" required minLength={8} autoFocus
            className={`${inputPos} pr-11`} placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} />
          <button type="button" onClick={() => setShowPass(!showPass)} aria-label="Mostrar contraseña"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="repetir" className={labelPos}>Repetir contraseña</label>
        <input id="repetir" type={showPass ? "text" : "password"} autoComplete="new-password" required minLength={8}
          className={inputPos} value={repetir} onChange={e => setRepetir(e.target.value)} />
      </div>
      <button type="submit" disabled={loading} className={botonPos}>
        {loading ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : invitacion ? "Crear contraseña y entrar" : "Guardar y entrar"}
      </button>
    </form>
  )
}
