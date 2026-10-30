import fs from "fs/promises"
import path from "path"
import { prisma } from "@/lib/prisma"
import { ErrorPos } from "./usuarios"
import { guardarLogo, normalizarLogo, LogoInvalido, urlLogo } from "./logo"
import { dirLogos } from "./servidor"
import { errorCodigo, normalizarCodigo, normalizarHex, normalizarPosUrl } from "./validacion"

// Alta y edición de cuentas desde un FormData (multipart, por el logo).
// modo "admin" = Hypnos (todo); modo "portal" = el negocio (nombre, colores y logo).

const CAMPOS_COLOR = ["colorPrimario", "colorTextoPrimario", "colorFondo", "colorTexto"] as const

type Modo = "admin" | "portal"

interface Cambios {
  codigo?: string; nombre?: string; posUrl?: string; activo?: boolean; clienteId?: string | null
  colorPrimario?: string; colorTextoPrimario?: string; colorFondo?: string; colorTexto?: string
}

async function leerForm(fd: FormData, modo: Modo, creando: boolean) {
  const cambios: Cambios = {}
  const presente = (k: string) => fd.has(k)

  if (presente("nombre") || creando) {
    const nombre = String(fd.get("nombre") ?? "").trim().slice(0, 60)
    if (!nombre) throw new ErrorPos("Escribe el nombre visible.")
    cambios.nombre = nombre
  }

  for (const campo of CAMPOS_COLOR) {
    if (!presente(campo)) continue
    const hex = normalizarHex(fd.get(campo))
    if (!hex) throw new ErrorPos("Los colores deben ser hexadecimales, por ejemplo #f26522.")
    cambios[campo] = hex
  }

  if (modo === "admin") {
    if (presente("codigo") || creando) {
      const codigo = normalizarCodigo(fd.get("codigo"))
      const err = errorCodigo(codigo)
      if (err) throw new ErrorPos(err)
      cambios.codigo = codigo
    }
    if (presente("posUrl") || creando) {
      const url = normalizarPosUrl(fd.get("posUrl"))
      if (!url) throw new ErrorPos("El link del sistema debe ser una dirección https válida.")
      cambios.posUrl = url
    }
    if (presente("activo")) cambios.activo = fd.get("activo") === "true"
    if (presente("clienteId")) {
      const id = String(fd.get("clienteId") ?? "").trim()
      if (id && !(await prisma.cliente.findUnique({ where: { id }, select: { id: true } }))) {
        throw new ErrorPos("El cliente de la gobernanza no existe.")
      }
      cambios.clienteId = id || null
    }
  }

  const archivo = fd.get("logo")
  let png: Buffer | null = null
  if (archivo instanceof File && archivo.size > 0) {
    try {
      png = await normalizarLogo(archivo)
    } catch (e) {
      if (e instanceof LogoInvalido) throw new ErrorPos(e.message)
      throw e
    }
  }
  const quitarLogo = fd.get("quitarLogo") === "1"
  return { cambios, png, quitarLogo }
}

async function codigoLibre(codigo: string, exceptoId?: string) {
  const otra = await prisma.posCuenta.findUnique({ where: { codigo }, select: { id: true } })
  if (otra && otra.id !== exceptoId) throw new ErrorPos(`El código «${codigo}» ya está en uso.`, 409)
}

export async function crearCuenta(fd: FormData) {
  const { cambios, png } = await leerForm(fd, "admin", true)
  await codigoLibre(cambios.codigo!)
  const cuenta = await prisma.posCuenta.create({
    data: {
      codigo: cambios.codigo!, nombre: cambios.nombre!, posUrl: cambios.posUrl!,
      activo: cambios.activo ?? true, clienteId: cambios.clienteId ?? null,
      ...Object.fromEntries(CAMPOS_COLOR.filter(c => cambios[c]).map(c => [c, cambios[c]])),
    },
  })
  if (!png) return cuenta
  const logo = await guardarLogo(cuenta.id, png)
  return prisma.posCuenta.update({ where: { id: cuenta.id }, data: { logo } })
}

export async function editarCuenta(id: string, fd: FormData, modo: Modo) {
  const actual = await prisma.posCuenta.findUnique({ where: { id } })
  if (!actual) throw new ErrorPos("Cuenta no encontrada.", 404)

  const { cambios, png, quitarLogo } = await leerForm(fd, modo, false)
  if (cambios.codigo && cambios.codigo !== actual.codigo) await codigoLibre(cambios.codigo, id)

  let logo: string | null | undefined
  if (png) logo = await guardarLogo(id, png)
  else if (quitarLogo && actual.logo) {
    await fs.rm(path.join(dirLogos(), actual.logo), { force: true })
    logo = null
  }

  const cuenta = await prisma.posCuenta.update({
    where: { id },
    // updatedAt cambia siempre: así cambia el ?v= del logo y la app refresca su caché
    data:  { ...cambios, ...(logo !== undefined ? { logo } : {}), updatedAt: new Date() },
  })
  return { antes: actual, cuenta }
}

/** Forma que consumen la app (API pública) y las vistas previas. */
export function configPublica(base: string, c: {
  codigo: string; nombre: string; posUrl: string; logo: string | null; updatedAt: Date
  colorPrimario: string; colorTextoPrimario: string; colorFondo: string; colorTexto: string
}) {
  return {
    code:    c.codigo,
    name:    c.nombre,
    posUrl:  c.posUrl,
    logoUrl: urlLogo(base, c),
    colors: {
      primary:    c.colorPrimario,
      onPrimary:  c.colorTextoPrimario,
      background: c.colorFondo,
      text:       c.colorTexto,
    },
    updatedAt: c.updatedAt.toISOString(),
  }
}
