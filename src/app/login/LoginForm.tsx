"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { toast } from "sonner"
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react"

export default function LoginForm() {
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm]         = useState({ email: "", password: "" })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await signIn("credentials", {
        email:    form.email,
        password: form.password,
        redirect: false,
      })
      if (res?.error) {
        toast.error("Correo o contraseña incorrectos")
      } else {
        window.location.href = "/admin"
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Hypnos Panel</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de licencias — Operadores</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-gray-500 tracking-wider uppercase">
                Correo
              </label>
              <input
                id="email"
                type="email"
                placeholder="operador@hypnosapps.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-gray-500 tracking-wider uppercase">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  className="w-full h-11 px-3.5 pr-11 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 mt-2"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Ingresando...</>
                : "Ingresar al panel"
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 Hypnos Agency — Acceso restringido
        </p>
      </div>
    </div>
  )
}
