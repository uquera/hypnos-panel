import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { enviarAlertaVencimiento } from "@/lib/email"

// GET /api/cron/alertas
// Llamado diariamente por crontab. Protegido por CRON_SECRET.
// Envía alertas a clientes que vencen en 7, 3 o 0 días y tienen emailContacto.
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const hoy     = new Date()
  const results = { enviados: 0, errores: 0, omitidos: 0 }

  const clientes = await prisma.cliente.findMany({
    where: { activo: true, suspendida: false, emailContacto: { not: null } },
  })

  for (const cliente of clientes) {
    const diasRestantes = Math.ceil(
      (new Date(cliente.fechaVencimiento).getTime() - hoy.getTime()) / 86_400_000
    )

    // Solo enviar en días exactos: 7, 3, 1, 0
    if (![7, 3, 1, 0].includes(diasRestantes)) {
      results.omitidos++
      continue
    }

    const fechaFormateada = new Date(cliente.fechaVencimiento).toLocaleDateString("es-CL", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    })

    try {
      await enviarAlertaVencimiento({
        clienteNombre:    cliente.nombre,
        clienteEmail:     cliente.emailContacto!,
        diasRestantes,
        fechaVencimiento: fechaFormateada,
        plan:             cliente.plan,
      })
      results.enviados++
      console.log(`[cron/alertas] Email enviado → ${cliente.nombre} (${diasRestantes}d)`)
    } catch (err) {
      results.errores++
      console.error(`[cron/alertas] Error enviando a ${cliente.nombre}:`, err)
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: hoy.toISOString(),
    ...results,
  })
}
