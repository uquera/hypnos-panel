import fs from "fs/promises"
import path from "path"
import sharp from "sharp"
import { dirLogos } from "./servidor"
import { LOGO_MAX_BYTES } from "./validacion"

// Logos de Hypnos POS: se aceptan PNG, JPG o SVG (≤ 2 MB) y se guardan siempre
// como PNG de máximo 512×512 (transparencia conservada) en POS_UPLOAD_DIR/<cuentaId>.png.
// La app y el panel los leen por GET /api/pos-app/logo/<codigo>.png.

export class LogoInvalido extends Error {}

const LADO_MAX = 512

function tipoDe(buf: Buffer): "png" | "jpg" | "svg" | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"
  const inicio = buf.subarray(0, 4096).toString("utf8").replace(/^﻿/, "").trimStart()
  if ((inicio.startsWith("<?xml") || inicio.startsWith("<svg") || inicio.startsWith("<!--")) && /<svg[\s>]/i.test(buf.toString("utf8"))) return "svg"
  return null
}

/** Valida y convierte el archivo subido a PNG normalizado. */
export async function normalizarLogo(archivo: File): Promise<Buffer> {
  if (archivo.size > LOGO_MAX_BYTES) throw new LogoInvalido("El logo pesa más de 2 MB.")
  const buf  = Buffer.from(await archivo.arrayBuffer())
  const tipo = tipoDe(buf)
  if (!tipo) throw new LogoInvalido("El logo debe ser PNG, JPG o SVG.")

  if (tipo === "svg") {
    const txt = buf.toString("utf8")
    // Sin scripts ni recursos externos: el SVG solo se rasteriza, nunca se sirve tal cual
    if (/<script|<foreignObject|\bon\w+\s*=/i.test(txt) || /href\s*=\s*["'](?!#|data:image\/)/i.test(txt)) {
      throw new LogoInvalido("El SVG trae scripts o enlaces externos. Expórtalo de nuevo o súbelo en PNG.")
    }
  }

  try {
    return await sharp(buf, tipo === "svg" ? { density: 384 } : {})
      .rotate()                                   // respeta la orientación EXIF de las fotos
      .resize(LADO_MAX, LADO_MAX, { fit: "inside", withoutEnlargement: tipo !== "svg" })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } catch {
    throw new LogoInvalido("No pudimos leer la imagen. Prueba con otro archivo.")
  }
}

/** Guarda el PNG de forma atómica y devuelve el nombre de archivo. */
export async function guardarLogo(cuentaId: string, png: Buffer): Promise<string> {
  const dir = dirLogos()
  await fs.mkdir(dir, { recursive: true })
  const nombre = `${cuentaId}.png`
  const tmp    = path.join(dir, `${nombre}.${process.pid}.tmp`)
  await fs.writeFile(tmp, png)
  await fs.rename(tmp, path.join(dir, nombre))
  return nombre
}

export async function leerLogo(nombre: string): Promise<Buffer | null> {
  if (!/^[a-z0-9]+\.png$/i.test(nombre)) return null
  try {
    return await fs.readFile(path.join(dirLogos(), nombre))
  } catch {
    return null
  }
}

/** URL pública y estable del logo; cambia ?v= cada vez que se edita la cuenta. */
export function urlLogo(base: string, cuenta: { codigo: string; logo: string | null; updatedAt: Date }): string | null {
  if (!cuenta.logo) return null
  return `${base}/api/pos-app/logo/${cuenta.codigo}.png?v=${cuenta.updatedAt.getTime()}`
}
