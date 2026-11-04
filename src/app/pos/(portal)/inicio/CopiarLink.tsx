"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

export default function CopiarLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" title="Copiar link"
      onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }) }}
      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 shrink-0">
      {ok ? <><Check size={13} className="text-green-600" /> Copiado</> : <><Copy size={13} /> Copiar</>}
    </button>
  )
}
