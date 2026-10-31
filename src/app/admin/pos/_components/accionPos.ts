"use client"

import { toast } from "sonner"

// Llamadas del tablero/ficha de Hypnos POS a /api/pos-admin. Muestra toasts y avisa
// cuando el cambio quedó guardado en el panel pero la instancia no respondió.

export async function postJson(url: string, body: unknown): Promise<Record<string, unknown> | null> {
  return enviar(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

/** POST multipart (formularios con archivos). */
export function postForm(url: string, fd: FormData) {
  return enviar(url, { method: "POST", body: fd })
}

async function enviar(url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, init)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error((d as { error?: string }).error ?? "No se pudo completar la acción."); return null }
    if ((d as { syncedRemote?: boolean }).syncedRemote === false) {
      toast.warning(`Guardado en el panel, pero no se sincronizó con la instancia${(d as { syncError?: string }).syncError ? `: ${(d as { syncError?: string }).syncError}` : ""}`)
    }
    return d as Record<string, unknown>
  } catch {
    toast.error("Error de red")
    return null
  }
}

export function accionPos(id: string, body: Record<string, unknown>) {
  return postJson(`/api/pos-admin/cuentas/${id}/acciones`, body)
}
