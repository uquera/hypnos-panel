"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, Loader2, MailCheck } from "lucide-react"
import PosAuthCard, { botonPos, inputPos, labelPos } from "../_components/PosAuthCard"

export default function PosRecuperarPage() {
  const [email, setEmail]     = useState("")
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res  = await fetch("/api/pos-portal/recuperar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
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
    <PosAuthCard titulo="Recuperar contraseña" subtitulo="Te enviaremos un enlace a tu correo"
      pie={<Link href="/pos/login" className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900"><ArrowLeft size={14} /> Volver a ingresar</Link>}>
      {enviado ? (
        <div className="text-center space-y-3">
          <MailCheck size={36} className="mx-auto text-gray-700" />
          <p className="text-sm text-gray-700">
            Si <strong>{email}</strong> tiene acceso a Hypnos POS, te llegará un correo con el enlace para elegir una nueva contraseña.
          </p>
          <p className="text-xs text-gray-400">El enlace vence en 1 hora. Revisa también la carpeta de spam.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className={labelPos}>Correo de tu cuenta</label>
            <input id="email" type="email" required autoFocus placeholder="tu@negocio.cl" className={inputPos}
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className={botonPos}>
            {loading ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : "Enviar enlace"}
          </button>
        </form>
      )}
    </PosAuthCard>
  )
}
