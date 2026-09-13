"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertTriangle } from "lucide-react"

export default function RestablecerForm({ token, valido, email }: { token: string; valido: boolean; email: string }) {
  const [password, setPassword] = useState("")
  const [confirma, setConfirma] = useState("")
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [listo, setListo]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres.")
    if (password !== confirma) return toast.error("Las contraseñas no coinciden.")
    setLoading(true)
    try {
      const res  = await fetch("/api/restablecer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(data.error ?? "No se pudo cambiar la contraseña.")
      else setListo(true)
    } catch {
      toast.error("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full h-11 px-3.5 pr-11 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva contraseña</h1>
          {valido && !listo && <p className="text-sm text-gray-500 mt-1">Para {email}</p>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {!valido ? (
            <div className="text-center space-y-3">
              <AlertTriangle size={36} className="mx-auto text-amber-500" />
              <p className="text-sm text-gray-700">El enlace no es válido, ya se usó o venció.</p>
              <Link href="/login/recuperar" className="inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                Pedir un enlace nuevo
              </Link>
            </div>
          ) : listo ? (
            <div className="text-center space-y-4">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
              <p className="text-sm text-gray-700">Listo, tu contraseña quedó cambiada.</p>
              <Link href="/login"
                className="w-full h-11 flex items-center justify-center rounded-xl text-sm font-semibold text-white hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
                Iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold text-gray-500 tracking-wider uppercase">Nueva contraseña</label>
                <div className="relative">
                  <input id="password" type={showPass ? "text" : "password"} placeholder="Mínimo 8 caracteres"
                    value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus
                    autoComplete="new-password" className={inputCls} />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirma" className="text-xs font-semibold text-gray-500 tracking-wider uppercase">Repite la contraseña</label>
                <input id="confirma" type={showPass ? "text" : "password"} placeholder="••••••••"
                  value={confirma} onChange={(e) => setConfirma(e.target.value)} required
                  autoComplete="new-password" className={inputCls} />
              </div>
              <button type="submit" disabled={loading}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Guardando...</> : "Guardar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
