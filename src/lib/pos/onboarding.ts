import fs from "fs/promises"
import path from "path"
import dns from "dns/promises"
import net from "net"
import sharp from "sharp"
import { prisma } from "@/lib/prisma"
import { ErrorPos } from "./usuarios"
import { guardarLogo } from "./logo"

// Datos de onboarding del restaurante (registro público y "Crear restaurante"):
// logo, link del menú online (Fudo u otro), mesas, dirección, horario y Excel de clientes.
// Se guardan en POS_ONBOARDING_DIR/<cuentaId>/ (por defecto <cwd>/uploads/pos-onboarding, fuera de public)
// y se pasan a `hypnos-pos-tenant create` (--logo, --menu-url, --mesas, --direccion, --telefono, --horario, --clientes).

export const LOGO_ONBOARDING_MAX = 5 * 1024 * 1024
export const CLIENTES_MAX = 10 * 1024 * 1024

export function dirOnboarding(cuentaId?: string): string {
  const base = process.env.POS_ONBOARDING_DIR || path.join(process.cwd(), "uploads", "pos-onboarding")
  return cuentaId ? path.join(base, cuentaId) : base
}

export interface Onboarding {
  menuUrl:   string
  mesas:     number
  direccion: string
  horario:   string
  logoPng:   Buffer | null
  clientes:  { buf: Buffer; ext: "xlsx" | "csv"; nombre: string } | null
}

// ─── Menú: URL pública http(s), nunca IPs privadas ni hosts internos ──────────

function ipPrivada(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  }
  const v = ip.toLowerCase()
  if (v.startsWith("::ffff:")) return ipPrivada(v.slice(7))
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")
}

/** Normaliza y valida el link del menú. "" si viene vacío; lanza ErrorPos si no sirve. */
export async function validarMenuUrl(v: unknown): Promise<string> {
  let s = String(v ?? "").trim().slice(0, 500)
  if (!s) return ""
  if (!/^https?:\/\//i.test(s)) s = "https://" + s
  let u: URL
  try { u = new URL(s) } catch { throw new ErrorPos("El link del menú no es válido. Cópialo completo desde tu navegador.") }
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !host.includes(".") ||
      host === "localhost" || /\.(local|internal|localhost|lan)$/.test(host)) {
    throw new ErrorPos("El link del menú debe ser una página pública (http o https).")
  }
  if (net.isIP(host)) {
    if (ipPrivada(host)) throw new ErrorPos("El link del menú debe ser una página pública.")
  } else {
    try {
      const ips = await dns.lookup(host, { all: true })
      if (ips.some(i => ipPrivada(i.address))) throw new ErrorPos("El link del menú debe ser una página pública.")
    } catch (e) {
      if (e instanceof ErrorPos) throw e
      throw new ErrorPos("No encontramos la página del menú. Revisa el link.")
    }
  }
  return u.toString()
}

// ─── Archivos ─────────────────────────────────────────────────────────────────

function esImagen(buf: Buffer): boolean {
  const png  = buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const jpg  = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  const webp = buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP"
  return png || jpg || webp
}

/** Logo PNG/JPG/WebP ≤ 5 MB → PNG normalizado ≤ 512 px (igual que los logos de la app). */
export async function leerLogoOnboarding(archivo: unknown): Promise<Buffer | null> {
  if (!(archivo instanceof File) || archivo.size === 0) return null
  if (archivo.size > LOGO_ONBOARDING_MAX) throw new ErrorPos("El logo pesa más de 5 MB.")
  const buf = Buffer.from(await archivo.arrayBuffer())
  if (!esImagen(buf)) throw new ErrorPos("El logo debe ser una imagen PNG, JPG o WebP.")
  try {
    return await sharp(buf).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer()
  } catch {
    throw new ErrorPos("No pudimos leer el logo. Prueba con otra imagen.")
  }
}

/** Excel (xlsx) o CSV de clientes, ≤ 10 MB, validando el contenido real. */
export async function leerClientes(archivo: unknown): Promise<Onboarding["clientes"]> {
  if (!(archivo instanceof File) || archivo.size === 0) return null
  if (archivo.size > CLIENTES_MAX) throw new ErrorPos("El archivo de clientes pesa más de 10 MB.")
  const buf = Buffer.from(await archivo.arrayBuffer())
  const nombre = archivo.name.slice(0, 120)
  const ext = path.extname(nombre).toLowerCase()
  // xlsx = ZIP (PK\x03\x04); csv = texto sin bytes nulos
  if (ext === ".xlsx" && buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return { buf, ext: "xlsx", nombre }
  if (ext === ".csv" && !buf.subarray(0, 8192).includes(0)) return { buf, ext: "csv", nombre }
  throw new ErrorPos("Los clientes deben venir en un Excel (.xlsx) o CSV (.csv).")
}

function texto(v: unknown, max: number): string {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max)
}

/** Lee y valida los campos de onboarding de un FormData (todos opcionales). */
export async function leerOnboarding(fd: FormData): Promise<Onboarding> {
  const mesasTxt = String(fd.get("mesas") ?? "").trim()
  const mesas = mesasTxt ? Math.round(Number(mesasTxt)) : 10
  if (!Number.isFinite(mesas) || mesas < 0 || mesas > 200) throw new ErrorPos("El número de mesas debe estar entre 0 y 200.")
  return {
    menuUrl:   await validarMenuUrl(fd.get("menuUrl")),
    mesas,
    direccion: texto(fd.get("direccion"), 160),
    horario:   texto(fd.get("horario"), 120),
    logoPng:   await leerLogoOnboarding(fd.get("logo")),
    clientes:  await leerClientes(fd.get("clientes")),
  }
}

/** Guarda logo y clientes de la cuenta recién creada (el logo también queda como logo de la app). */
export async function guardarOnboarding(cuentaId: string, o: Onboarding) {
  const dir = dirOnboarding(cuentaId)
  const data: { logo?: string; archivoClientes?: string; archivoClientesNombre?: string } = {}
  if (o.logoPng || o.clientes) await fs.mkdir(dir, { recursive: true })
  if (o.logoPng) {
    await fs.writeFile(path.join(dir, "logo.png"), o.logoPng)
    data.logo = await guardarLogo(cuentaId, o.logoPng)
  }
  if (o.clientes) {
    const nombre = `clientes.${o.clientes.ext}`
    await fs.writeFile(path.join(dir, nombre), o.clientes.buf)
    data.archivoClientes = nombre
    data.archivoClientesNombre = o.clientes.nombre
  }
  if (Object.keys(data).length) await prisma.posCuenta.update({ where: { id: cuentaId }, data })
}

/** Ruta absoluta del logo para el comando (el de onboarding o, si no, el de la app). */
export async function rutaLogo(cuenta: { id: string; logo: string | null }, dirLogos: string): Promise<string | null> {
  const candidatos = [path.join(dirOnboarding(cuenta.id), "logo.png"), ...(cuenta.logo ? [path.join(dirLogos, cuenta.logo)] : [])]
  for (const c of candidatos) {
    try { await fs.access(c); return path.resolve(c) } catch { /* sigue */ }
  }
  return null
}

export function rutaClientes(cuenta: { id: string; archivoClientes: string | null }): string | null {
  if (!cuenta.archivoClientes || !/^clientes\.(xlsx|csv)$/.test(cuenta.archivoClientes)) return null
  return path.resolve(dirOnboarding(cuenta.id), cuenta.archivoClientes)
}

export interface ResultadoAlta {
  menu?:     { ok: boolean; productos?: number; error?: string }
  clientes?: { ok: boolean; importados?: number; error?: string }
}

export function leerResultadoAlta(json: string | null): ResultadoAlta {
  if (!json) return {}
  try { return JSON.parse(json) as ResultadoAlta } catch { return {} }
}
