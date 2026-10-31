import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { patchLicenciaRemota } from "@/lib/gobernanza-remota"
import { basePublica } from "@/lib/pos/servidor"
import { diasGracia } from "@/lib/pos/config"
import { claveDiaChile, diasHastaChile } from "@/lib/pos/fechas"
import { correoCobroDe, precioDe } from "@/lib/pos/cobro"
import { correoCobro, correoPruebaTermina, correoSuspension } from "@/lib/pos/correos"

// GET /api/cron/pos-cobros — cobro diario de Hypnos POS. Protegido por CRON_SECRET (igual que /api/cron/alertas).
// Crontab del VPS (09:00 hora de Chile):
//   0 9 * * * curl -4 -s -H "x-cron-secret: $CRON_SECRET" https://panel.hypnosapps.com/api/cron/pos-cobros >> /var/log/hypnos-pos-cobros.log 2>&1
// Por cada restaurante instalado (estadoAlta LISTO, no eliminado, con licencia):
//   prueba: 3 días antes → PRUEBA_3; 1 día antes → PRUEBA_1
//   pagado: 5 días antes → COBRO_5
//   día del vencimiento (o después, dentro de la gracia) → VENCE_HOY
//   vencido + POS_DIAS_GRACIA → suspende (PATCH suspendida:true) y SUSPENSION
// Cada aviso se guarda en pos_avisos (cuenta, tipo, período = fecha de vencimiento) y no se repite.
// Si el cron se salta un día, el aviso pendiente sale al día siguiente (rangos, no días exactos).
// ?dry=1 informa sin enviar ni suspender.

type Tipo = "PRUEBA_3" | "PRUEBA_1" | "COBRO_5" | "VENCE_HOY" | "SUSPENSION"

function avisoQueToca(dias: number, enPrueba: boolean, gracia: number): Tipo | null {
  if (dias <= -gracia) return "SUSPENSION"
  if (dias <= 0) return "VENCE_HOY"
  if (enPrueba) {
    if (dias === 1) return "PRUEBA_1"
    if (dias <= 3) return "PRUEBA_3"
    return null
  }
  return dias <= 5 ? "COBRO_5" : null
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")
  if (!secret || !process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const dry    = req.nextUrl.searchParams.get("dry") === "1"
  const hoy    = new Date()
  const gracia = diasGracia()
  const base   = basePublica()
  const linkPago = `${base}/pos/pago`
  const res = { revisadas: 0, enviados: 0, suspendidas: 0, omitidos: 0, errores: 0, detalle: [] as string[] }

  const cuentas = await prisma.posCuenta.findMany({
    where: { estadoAlta: "LISTO", eliminadaAt: null, clienteId: { not: null }, cliente: { activo: true, suspendida: false } },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
  })

  for (const c of cuentas) {
    const cliente = c.cliente!
    res.revisadas++
    const dias = diasHastaChile(cliente.fechaVencimiento, hoy)
    const tipo = avisoQueToca(dias, c.enPrueba, gracia)
    if (!tipo) { res.omitidos++; continue }

    const periodo = claveDiaChile(cliente.fechaVencimiento)
    const ya = await prisma.posAviso.findUnique({ where: { cuentaId_tipo_periodo: { cuentaId: c.id, tipo, periodo } } })
    if (ya) { res.omitidos++; continue }

    res.detalle.push(`${c.codigo}: ${tipo} (${dias}d)`)
    if (dry) continue

    const to = correoCobroDe(c)
    const monto = precioDe(c)
    try {
      if (tipo === "SUSPENSION") {
        await prisma.cliente.update({ where: { id: cliente.id }, data: { suspendida: true } })
        const r = await patchLicenciaRemota(cliente, { suspendida: true })
        await logActividad({
          usuarioId: "sistema", usuarioNombre: "Cron Hypnos POS", clienteId: cliente.id, clienteNombre: cliente.nombre,
          accion: "LICENCIA_SYNC", detalle: `[Hypnos POS] Suspendida por no pago (${-dias} días vencida)${r.ok ? "" : ` · sin sincronizar: ${r.error}`}`,
        })
        res.suspendidas++
        if (to) await correoSuspension({ to, restaurante: c.nombre, linkPago, monto }).catch(e => console.error("[cron/pos-cobros] correo suspensión:", e))
      } else if (to) {
        if (tipo === "PRUEBA_3" || tipo === "PRUEBA_1") {
          await correoPruebaTermina({ to, restaurante: c.nombre, dias, vence: cliente.fechaVencimiento, linkPago, monto })
        } else {
          await correoCobro({ to, restaurante: c.nombre, dias, vence: cliente.fechaVencimiento, linkPago, enPrueba: c.enPrueba, monto })
        }
        res.enviados++
      }
      await prisma.posAviso.create({ data: { cuentaId: c.id, tipo, periodo } }).catch(() => {})
    } catch (err) {
      // El correo falló: no se registra el aviso y se reintenta en la próxima ejecución
      res.errores++
      console.error(`[cron/pos-cobros] ${c.codigo} ${tipo}:`, err)
    }
  }

  console.log(`[cron/pos-cobros] ${JSON.stringify({ ...res, detalle: undefined })}`)
  return NextResponse.json({ ok: true, fecha: hoy.toISOString(), dry, ...res })
}
