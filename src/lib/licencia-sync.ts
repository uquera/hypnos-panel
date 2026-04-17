"use server"

import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"

export interface SyncData {
  plan?:             string
  fechaVencimiento?: string   // ISO date string
  suspendida?:       boolean
  notasAdmin?:       string
}

export interface SyncResult {
  ok:          boolean
  syncedRemote: boolean
  error?:      string
}

export async function syncLicencia(
  clienteId: string,
  data: SyncData
): Promise<SyncResult> {
  // 1. Actualizar en base de datos local
  const updateData: Record<string, unknown> = {}
  if (data.plan             !== undefined) updateData.plan             = data.plan
  if (data.fechaVencimiento !== undefined) updateData.fechaVencimiento = new Date(data.fechaVencimiento)
  if (data.suspendida       !== undefined) updateData.suspendida       = data.suspendida
  if (data.notasAdmin       !== undefined) updateData.notasAdmin       = data.notasAdmin

  const cliente = await prisma.cliente.update({
    where: { id: clienteId },
    data: updateData,
  })

  // 2. Sincronizar con el servidor remoto del cliente
  let syncedRemote = false
  let syncError: string | undefined

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    const res = await fetch(cliente.apiUrl, {
      method:  "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key":  cliente.masterKey,
      },
      body:   JSON.stringify(data),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (res.ok) {
      syncedRemote = true
    } else {
      syncError = `HTTP ${res.status} al sincronizar con ${cliente.dominio}`
    }
  } catch (err) {
    syncError = err instanceof Error && err.name === "AbortError"
      ? `Tiempo de espera agotado conectando a ${cliente.dominio}`
      : `No se pudo conectar con ${cliente.dominio}`
  }

  revalidatePath("/admin")
  revalidatePath(`/admin/clientes/${clienteId}`)

  return { ok: true, syncedRemote, error: syncError }
}

