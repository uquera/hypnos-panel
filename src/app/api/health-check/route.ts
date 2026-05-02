import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export interface HealthResult {
  clienteId: string
  nombre:    string
  online:    boolean
  latencia:  number | null
  error:     string | null
  checkedAt: string
}

// GET /api/health-check
// Verifica el estado de todos los clientes activos en paralelo.
// Actualiza ultimoCheck y ultimoCheckOk en DB.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const clientes = await prisma.cliente.findMany({
    where:  { activo: true },
    select: { id: true, nombre: true, apiUrl: true, masterKey: true },
  })

  const checkedAt = new Date()

  const results: HealthResult[] = await Promise.all(
    clientes.map(async (c) => {
      const t0 = Date.now()
      let online  = false
      let latencia: number | null = null
      let error: string | null = null

      try {
        const controller = new AbortController()
        const timeout    = setTimeout(() => controller.abort(), 8_000)
        const res = await fetch(c.apiUrl, {
          method:  "GET",
          headers: { "X-Master-Key": c.masterKey },
          signal:  controller.signal,
        })
        clearTimeout(timeout)
        latencia = Date.now() - t0
        online   = res.ok
        if (!res.ok) error = `HTTP ${res.status}`
      } catch (err: unknown) {
        latencia = null
        error    = err instanceof Error
          ? (err.name === "AbortError" ? "Timeout (8s)" : err.message)
          : "Error de red"
      }

      // Persistir resultado en DB (sin await para no bloquear respuesta)
      prisma.cliente.update({
        where: { id: c.id },
        data:  { ultimoCheck: checkedAt, ultimoCheckOk: online },
      }).catch(() => {})

      return { clienteId: c.id, nombre: c.nombre, online, latencia, error, checkedAt: checkedAt.toISOString() }
    })
  )

  return NextResponse.json({ ok: true, results })
}
