"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Network, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

type Cadena = { id: string; nombre: string; correos: string; cuentaIds: string[] }
type Cuenta = { id: string; nombre: string; codigo: string; cadenaId: string | null; duenos: string[]; listo: boolean }

export default function CadenasEditor({ cadenas, cuentas }: { cadenas: Cadena[]; cuentas: Cuenta[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<Cadena | null>(null)
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)

  async function guardar() {
    if (!edit) return
    setBusy(true)
    try {
      const res = await fetch("/api/pos-admin/cadenas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar")
      toast.success("Cadena guardada")
      setEdit(null)
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error") } finally { setBusy(false) }
  }

  async function borrar(c: Cadena) {
    if (!confirm(`¿Borrar la cadena ${c.nombre}? Los locales siguen funcionando igual; solo deja de verse «Mi cadena».`)) return
    const res = await fetch(`/api/pos-admin/cadenas?id=${c.id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Cadena borrada"); router.refresh() } else toast.error("No se pudo borrar")
  }

  const nombreDe = (id: string) => cuentas.find((c) => c.id === id)?.nombre ?? id
  const filtro = q.trim().toLowerCase()
  const visibles = cuentas.filter((c) => !filtro || c.nombre.toLowerCase().includes(filtro) || c.codigo.includes(filtro) || edit?.cuentaIds.includes(c.id))

  return (
    <div className="space-y-4">
      {cadenas.length === 0 && !edit && <p className="text-sm text-gray-500">Aún no hay cadenas.</p>}
      {cadenas.map((c) => (
        <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-start gap-3">
          <Network size={18} className="text-orange-500 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">{c.nombre}</p>
            <p className="text-sm text-gray-600">{c.cuentaIds.map(nombreDe).join(" · ")}</p>
            <p className="text-xs text-gray-500">Dueños: {c.correos.split(",").join(", ")}</p>
          </div>
          <button onClick={() => setEdit({ ...c })} className="h-8 px-3 rounded-lg border border-gray-200 text-sm hover:bg-gray-50">Editar</button>
          <button onClick={() => void borrar(c)} title="Borrar" className="h-8 w-8 rounded-lg border border-gray-200 text-red-500 hover:bg-red-50 inline-flex items-center justify-center"><Trash2 size={14} /></button>
        </div>
      ))}

      {!edit && (
        <button onClick={() => setEdit({ id: "", nombre: "", correos: "", cuentaIds: [] })}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:opacity-90">
          <Plus size={15} /> Nueva cadena
        </button>
      )}

      {edit && (
        <div className="bg-white rounded-2xl border border-orange-200 shadow-sm p-4 space-y-3">
          <p className="font-semibold text-gray-900">{edit.id ? "Editar cadena" : "Nueva cadena"}</p>
          <label className="block text-sm">
            <span className="text-gray-600">Nombre</span>
            <input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="Okiri Sushi"
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Correos de los dueños (separados por coma)</span>
            <input value={edit.correos} onChange={(e) => setEdit({ ...edit, correos: e.target.value })} placeholder="dueno@correo.cl"
              className="mt-1 w-full h-10 rounded-lg border border-gray-200 px-3" />
            <span className="text-xs text-gray-500">Deben ser usuarios del portal (de cualquiera de los locales).</span>
          </label>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-600">Locales ({edit.cuentaIds.length} elegidos)</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar local…" className="h-8 rounded-lg border border-gray-200 px-2 text-sm" />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
              {visibles.map((c) => {
                const otra = !!c.cadenaId && c.cadenaId !== edit.id
                return (
                  <label key={c.id} className={`flex items-center gap-2 px-3 py-2 text-sm ${otra ? "opacity-50" : ""}`}>
                    <input type="checkbox" disabled={otra} checked={edit.cuentaIds.includes(c.id)}
                      onChange={(e) => setEdit({ ...edit, cuentaIds: e.target.checked ? [...edit.cuentaIds, c.id] : edit.cuentaIds.filter((x) => x !== c.id) })} />
                    <span className="font-medium text-gray-900">{c.nombre}</span>
                    <span className="font-mono text-xs text-gray-400">{c.codigo}</span>
                    {!c.listo && <span className="text-xs text-amber-600">sin conexión automática</span>}
                    {otra && <span className="text-xs text-gray-500">en otra cadena</span>}
                    <span className="ml-auto truncate text-xs text-gray-400">{c.duenos.join(", ")}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEdit(null)} className="h-10 px-4 rounded-xl border border-gray-200 text-sm">Cancelar</button>
            <button onClick={() => void guardar()} disabled={busy} className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-[#f26522] disabled:opacity-50">
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
