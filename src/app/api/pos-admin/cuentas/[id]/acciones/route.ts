import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { adminPos, jsonError, manejar } from "@/lib/pos/api"
import { basePublica } from "@/lib/pos/servidor"
import { ErrorPos, enviarInvitacion } from "@/lib/pos/usuarios"
import { EMAIL_RE } from "@/lib/pos/validacion"
import { lanzarAlta, eliminarInstancia, estadoInstancia } from "@/lib/pos/alta"
import { cambiarLicenciaPos, registrarPagoPos, precioDe } from "@/lib/pos/cobro"
import { correoBienvenida } from "@/lib/pos/correos"
import { finDelDiaChile } from "@/lib/pos/fechas"
import { precioMensual } from "@/lib/pos/config"

// POST /api/pos-admin/cuentas/:id/acciones — acciones de Hypnos sobre un restaurante (solo ADMIN).
// { accion, ...datos }:
//   guardar            nombre, dueno, email, whatsapp, notas, vence (YYYY-MM-DD), precioMensual ("" = precio general)
//   suspender | reactivar
//   extender-prueba    dias (7|14|…) o fecha (YYYY-MM-DD)
//   pasar-pagado       quita enPrueba
//   pago-manual        monto, meses, fechaPago (YYYY-MM-DD), notas
//   reenviar           correo de bienvenida (si está instalado) + invitación al portal
//   reintentar         vuelve a lanzar la instalación (estado ERROR o estancada)
//   verificar          hypnos-pos-tenant status
//   eliminar           confirmar = código; hypnos-pos-tenant destroy y marca la cuenta como eliminada
// Los cambios de licencia se sincronizan con la instancia (PATCH de gobernanza).

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await adminPos()
  if (!session) return jsonError("No autorizado", 401)
  const { id } = await params
  const operador = { id: session.user.id, nombre: session.user.name ?? "Hypnos" }

  return manejar(async () => {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const cuenta = await prisma.posCuenta.findUnique({
      where: { id },
      include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
    })
    if (!cuenta) throw new ErrorPos("Cuenta no encontrada.", 404)
    const manual = cuenta.estadoAlta === "MANUAL"
    const accion = String(body.accion ?? "")
    if (cuenta.eliminadaAt && accion !== "verificar") throw new ErrorPos("La cuenta está eliminada.")

    const log = (detalle: string, a = "POS_CUENTA_EDITADA") => logActividad({
      usuarioId: operador.id, usuarioNombre: operador.nombre, clienteId: cuenta.clienteId ?? undefined,
      clienteNombre: cuenta.nombre, accion: a, detalle: `${cuenta.codigo}: ${detalle}`,
    })

    switch (accion) {
      case "guardar": {
        const nombre   = String(body.nombre ?? cuenta.nombre).trim().replace(/\s+/g, " ").slice(0, 60)
        const whatsapp = String(body.whatsapp ?? cuenta.whatsapp).trim().slice(0, 30)
        if (nombre.length < 2) throw new ErrorPos("Escribe el nombre del restaurante.")
        const precioTxt = String(body.precioMensual ?? "").replace(/[^\d]/g, "")
        const precio = precioTxt ? Number(precioTxt) : null
        if (precio !== null && (precio < 1 || precio > 10_000_000)) throw new ErrorPos("Precio mensual no válido.")

        const dueno = cuenta.usuarios[0]
        const duenoNombre = String(body.dueno ?? dueno?.nombre ?? "").trim().slice(0, 80)
        const email = String(body.email ?? dueno?.email ?? "").trim().toLowerCase().slice(0, 180)
        if (body.email !== undefined && !EMAIL_RE.test(email)) throw new ErrorPos("Correo del dueño no válido.")
        if (dueno && email !== dueno.email) {
          const otro = await prisma.posUsuario.findUnique({ where: { email }, select: { id: true } })
          if (otro) throw new ErrorPos("Ese correo ya tiene acceso a una cuenta de Hypnos POS.", 409)
        }

        await prisma.$transaction([
          prisma.posCuenta.update({ where: { id }, data: { nombre, whatsapp, precioMensual: precio, updatedAt: new Date() } }),
          ...(dueno ? [prisma.posUsuario.update({ where: { id: dueno.id }, data: { nombre: duenoNombre || dueno.nombre, email } })] : []),
          ...(cuenta.cliente ? [prisma.cliente.update({
            where: { id: cuenta.cliente.id },
            data: {
              nombre,
              ...(body.email !== undefined ? { emailContacto: email } : {}),
              ...(body.notas !== undefined ? { notasAdmin: String(body.notas).slice(0, 4000) || null } : {}),
            },
          })] : []),
        ])

        let sync: { syncedRemote: boolean; syncError?: string } | null = null
        if (cuenta.cliente && body.vence) {
          const vence = finDelDiaChile(String(body.vence))
          if (!vence) throw new ErrorPos("Fecha de vencimiento no válida.")
          if (Math.abs(vence.getTime() - cuenta.cliente.fechaVencimiento.getTime()) > 60_000) {
            sync = await cambiarLicenciaPos(id, { fechaVencimiento: vence }, operador)
          }
        }
        await log("editó datos")
        return NextResponse.json({ ok: true, ...(sync ?? {}) })
      }

      case "suspender":
      case "reactivar": {
        const r = await cambiarLicenciaPos(id, { suspendida: accion === "suspender" }, operador)
        return NextResponse.json({ ok: true, ...r })
      }

      case "extender-prueba": {
        if (!cuenta.cliente) throw new ErrorPos("Esta cuenta no tiene licencia.")
        let vence: Date | null
        if (body.fecha) vence = finDelDiaChile(String(body.fecha))
        else {
          const dias = Math.round(Number(body.dias))
          if (!(dias > 0 && dias <= 90)) throw new ErrorPos("Días no válidos.")
          const base = cuenta.cliente.fechaVencimiento > new Date() ? cuenta.cliente.fechaVencimiento : new Date()
          vence = new Date(base.getTime() + dias * 86_400_000)
        }
        if (!vence || vence.getTime() < Date.now()) throw new ErrorPos("Elige una fecha futura.")
        const r = await cambiarLicenciaPos(id, { fechaVencimiento: vence, enPrueba: true, suspendida: false }, operador)
        return NextResponse.json({ ok: true, hasta: vence.toISOString(), ...r })
      }

      case "pasar-pagado": {
        const r = await cambiarLicenciaPos(id, { enPrueba: false }, operador)
        return NextResponse.json({ ok: true, ...r })
      }

      case "pago-manual": {
        const monto = Number(String(body.monto ?? "").replace(/[^\d]/g, "")) || precioDe(cuenta)
        const fecha = body.fechaPago ? finDelDiaChile(String(body.fechaPago)) : null
        const r = await registrarPagoPos({
          cuentaId: id, monto, meses: Number(body.meses) || 1,
          fechaPago: fecha && fecha.getTime() <= Date.now() + 86_400_000 ? fecha : new Date(),
          notas: String(body.notas ?? "").trim().slice(0, 300) || "Hypnos POS · pago manual",
          operador,
        })
        return NextResponse.json({ ok: true, hasta: r.hasta.toISOString(), syncedRemote: r.syncedRemote, syncError: r.syncError })
      }

      case "reenviar": {
        const dueno = cuenta.usuarios[0]
        if (!dueno) throw new ErrorPos("La cuenta no tiene dueño.")
        const base = basePublica(req)
        if (cuenta.estadoAlta === "LISTO" && cuenta.cliente) {
          await correoBienvenida({
            to: dueno.email, dueno: dueno.nombre, restaurante: cuenta.nombre, url: cuenta.posUrl,
            enPrueba: cuenta.enPrueba, vence: cuenta.cliente.fechaVencimiento, linkPago: `${base}/pos/pago`,
            monto: cuenta.precioMensual ?? precioMensual(),
          })
        }
        const enviado = await enviarInvitacion(dueno.id, "Hypnos", base)
        await log("reenvió bienvenida/invitación")
        return NextResponse.json({ ok: true, enviado })
      }

      case "reintentar": {
        if (manual) throw new ErrorPos("Instalación manual: no aplica.")
        await lanzarAlta(id)
        await log("reintentó la instalación", "POS_ALTA_REINTENTO")
        return NextResponse.json({ ok: true })
      }

      case "verificar": {
        if (manual) throw new ErrorPos("Instalación manual: no aplica.")
        return NextResponse.json({ ok: true, estado: await estadoInstancia(cuenta.codigo) })
      }

      case "eliminar": {
        if (manual) throw new ErrorPos("Instalación manual: no se elimina desde aquí.")
        if (String(body.confirmar ?? "") !== cuenta.codigo) throw new ErrorPos("Escribe el código exacto para confirmar.")
        const r = await eliminarInstancia(cuenta.codigo)
        if (!r.ok && body.forzar !== true) {
          return jsonError(`No se pudo eliminar la instancia: ${r.error}. Revisa el servidor o fuerza la baja.`, 502)
        }
        const ahora = new Date()
        const nota = `\n[panel ${ahora.toISOString()}] ELIMINADA por ${operador.nombre}${r.ok ? "" : ` (forzada; destroy falló: ${r.error})`}\n${r.log}`
        await prisma.$transaction([
          prisma.posCuenta.update({
            where: { id },
            data: { eliminadaAt: ahora, activo: false, altaLog: ((cuenta.altaLog ?? "") + nota).slice(-20_000) },
          }),
          ...(cuenta.clienteId ? [prisma.cliente.update({ where: { id: cuenta.clienteId }, data: { activo: false, suspendida: true } })] : []),
        ])
        await log(r.ok ? "eliminó el restaurante" : "eliminó el restaurante (forzado)", "POS_RESTAURANTE_ELIMINADO")
        return NextResponse.json({ ok: true })
      }
    }
    throw new ErrorPos("Acción no válida.")
  })
}
