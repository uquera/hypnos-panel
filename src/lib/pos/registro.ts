import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { ErrorPos } from "./usuarios"
import { EMAIL_RE, COLORES_DEFECTO, normalizarCodigo } from "./validacion"
import { DOMINIO_POS, errorCodigoDisponible, lanzarAlta } from "./alta"
import { diasPrueba } from "./config"
import { fechaCorta } from "./fechas"
import { guardarOnboarding, type Onboarding } from "./onboarding"

// Alta de un restaurante (registro público /pos/registro y "Crear restaurante" del admin).
// Crea en una transacción: Cliente (gobernanza, plan POS) + PosCuenta + PosUsuario DUENO,
// y lanza la instalación de la instancia en segundo plano (alta.ts).

export interface DatosRestaurante {
  nombre:   string
  dueno:    string
  email:    string
  whatsapp: string
  codigo:   string
}

export function leerDatosRestaurante(entrada: Record<string, unknown> | FormData): DatosRestaurante {
  const body: Record<string, unknown> = entrada instanceof FormData
    ? Object.fromEntries([...entrada.entries()].filter(([, v]) => typeof v === "string"))
    : entrada
  const nombre   = String(body.nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 60)
  const dueno    = String(body.dueno ?? "").trim().replace(/\s+/g, " ").slice(0, 80)
  const email    = String(body.email ?? "").trim().toLowerCase().slice(0, 180)
  const whatsapp = String(body.whatsapp ?? "").trim().slice(0, 30)
  const codigo   = normalizarCodigo(body.codigo)
  if (nombre.length < 2) throw new ErrorPos("Escribe el nombre del restaurante.")
  if (dueno.length < 2)  throw new ErrorPos("Escribe tu nombre.")
  if (!EMAIL_RE.test(email)) throw new ErrorPos("Escribe un correo válido.")
  if (whatsapp.replace(/\D/g, "").length < 8) throw new ErrorPos("Escribe un WhatsApp válido.")
  return { nombre, dueno, email, whatsapp, codigo }
}

/** Un correo = un dueño de Hypnos POS (PosUsuario.email es único) y una sola prueba activa. */
async function validarCorreo(email: string) {
  const usuario = await prisma.posUsuario.findUnique({ where: { email }, select: { id: true } })
  if (usuario) throw new ErrorPos("Ese correo ya tiene una cuenta de Hypnos POS. Entra en /pos/login o escríbenos a contacto@hypnosapps.com.", 409)
  const pruebaActiva = await prisma.posCuenta.findFirst({
    where: { enPrueba: true, cliente: { emailContacto: email, fechaVencimiento: { gt: new Date() } } },
    select: { id: true },
  })
  if (pruebaActiva) throw new ErrorPos("Ese correo ya tiene una prueba activa.", 409)
}

export async function crearRestaurante(d: DatosRestaurante, o: {
  enPrueba: boolean
  vence?:   Date            // obligatorio si no es prueba
  origen:   "REGISTRO" | "ADMIN"
  ip?:      string
  onboarding?: Onboarding   // logo, menú, mesas, dirección, horario, clientes (ya validados)
}) {
  const errCodigo = await errorCodigoDisponible(d.codigo)
  if (errCodigo) throw new ErrorPos(errCodigo, 409)
  await validarCorreo(d.email)

  const ahora = new Date()
  const vence = o.enPrueba ? new Date(ahora.getTime() + diasPrueba() * 86_400_000) : o.vence
  if (!vence || isNaN(vence.getTime())) throw new ErrorPos("Indica la fecha de vencimiento.")

  const host = `${d.codigo}.${DOMINIO_POS}`
  const notas = [
    `WhatsApp: ${d.whatsapp}`,
    `Dueño: ${d.dueno}`,
    o.origen === "REGISTRO" ? `Registro público ${fechaCorta(ahora)}${o.ip ? ` · IP ${o.ip}` : ""}` : `Creado desde el panel ${fechaCorta(ahora)}`,
    o.enPrueba ? `Prueba gratis hasta ${fechaCorta(vence)}` : "",
  ].filter(Boolean).join("\n")

  let cuentaId: string
  try {
    cuentaId = await prisma.$transaction(async tx => {
      const cliente = await tx.cliente.create({
        data: {
          nombre: d.nombre,
          dominio: host,
          apiUrl: `https://${host}/api/gobernanza/licencia`,
          masterKey: crypto.randomBytes(32).toString("hex"),
          plan: "POS",
          fechaVencimiento: vence,
          emailContacto: d.email,
          notasAdmin: notas,
        },
      })
      const cuenta = await tx.posCuenta.create({
        data: {
          codigo: d.codigo, nombre: d.nombre, posUrl: `https://${host}`,
          ...COLORES_DEFECTO,
          clienteId: cliente.id,
          estadoAlta: "PENDIENTE",
          enPrueba: o.enPrueba,
          whatsapp: d.whatsapp,
          origen: o.origen,
          terminosAt: o.origen === "REGISTRO" ? ahora : null,
          ...(o.onboarding ? {
            menuUrl: o.onboarding.menuUrl, mesas: o.onboarding.mesas,
            direccion: o.onboarding.direccion, horario: o.onboarding.horario,
          } : {}),
        },
      })
      await tx.posUsuario.create({ data: { cuentaId: cuenta.id, nombre: d.dueno, email: d.email, rol: "DUENO" } })
      return cuenta.id
    })
  } catch (e) {
    // Carrera con otro registro del mismo código o correo (índices únicos)
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") {
      throw new ErrorPos("Ese subdominio o correo acaba de ser usado. Prueba con otro.", 409)
    }
    throw e
  }

  if (o.onboarding) {
    await guardarOnboarding(cuentaId, o.onboarding).catch(e => console.error("[pos-registro] archivos de onboarding:", e))
  }
  await lanzarAlta(cuentaId).catch(e => console.error("[pos-registro] no se pudo lanzar el alta:", e))
  return cuentaId
}

// ─── Token para consultar el estado de la instalación desde la página pública ──

function secreto(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "hypnos-dev"
}

export function tokenEstado(cuentaId: string): string {
  return crypto.createHmac("sha256", secreto()).update(`pos-registro-estado.${cuentaId}`).digest("base64url").slice(0, 32)
}

export function tokenEstadoValido(cuentaId: string, token: string): boolean {
  const a = Buffer.from(tokenEstado(cuentaId))
  const b = Buffer.from(String(token))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
