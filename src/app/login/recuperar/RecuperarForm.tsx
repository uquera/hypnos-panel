"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Loader2, ShieldCheck, MailCheck, ArrowLeft } from "lucide-react"

export default function RecuperarForm() {
  const [email, setEmail]     = useState("")
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res  = await fetch("/api/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(data.error ?? "No se pudo procesar la solicitud.")
      else setEnviado(true)
    } catch {
      toast.error("No se pudo conectar con el servidor. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">Te enviaremos un enlace a tu correo</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {enviado ? (
            <div className="text-center space-y-3">
              <MailCheck size={36} className="mx-auto text-indigo-500" />
              <p className="text-sm text-gray-700">
                Si <strong>{email}</strong> pertenece a una cuenta del panel, te llegará un correo con el enlace para elegir una nueva contraseña.
              </p>
              <p className="text-xs text-gray-400">El enlace vence en 30 minutos. Revisa también la carpeta de spam.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold text-gray-500 tracking-wider uppercase">
                  Correo de tu cuenta
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="operador@hypnosapps.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : "Enviar enlace"}
              </button>
            </form>
          )}
        </div>

        <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 mt-6">
          <ArrowLeft size={14} /> Volver a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
