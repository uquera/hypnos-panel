// Saca el texto de un comprobante para poder revisarlo.
//
// PDF → `pdftotext` (poppler); si el PDF no trae capa de texto (es un escaneo),
// se rasteriza con `pdftoppm` y se pasa por OCR. Imagen → `tesseract` con los
// idiomas spa+eng, que es lo que llega: boletas chilenas y recibos en inglés.
//
// Son binarios del sistema a propósito (apt install tesseract-ocr
// tesseract-ocr-spa poppler-utils): no se puede instalar una dependencia de
// 30 MB en el proyecto por esto. Si en la máquina no están, no se cae nada:
// devuelve motor "no-disponible" y el gasto se guarda como "sin verificar"
// pidiendo confirmación, igual que un documento ilegible.

import { execFile } from "child_process"
import { randomUUID } from "crypto"
import fs from "fs/promises"
import os from "os"
import path from "path"
import type { TipoArchivo } from "@/lib/comprobantes"

const TIMEOUT_MS  = 25_000
const MAX_SALIDA  = 1024 * 1024   // texto extraído: más que esto no aporta

export type MotorTexto = "pdftotext" | "ocr" | "no-disponible" | "error"

export interface TextoComprobante {
  texto: string
  motor: MotorTexto
}

function correr(cmd: string, args: string[]): Promise<{ out: string; falta: boolean }> {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: MAX_SALIDA, encoding: "utf8" }, (err, stdout) => {
      const falta = !!err && (err as NodeJS.ErrnoException).code === "ENOENT"
      resolve({ out: stdout ?? "", falta })
    })
  })
}

async function ocrDeImagen(ruta: string): Promise<{ texto: string; falta: boolean }> {
  // --psm 3 (el de fábrica) es el que mejor se porta con capturas de pantalla.
  const { out, falta } = await correr("tesseract", [ruta, "stdout", "-l", "spa+eng"])
  return { texto: out.trim(), falta }
}

export async function extraerTexto(buf: Buffer, tipo: TipoArchivo): Promise<TextoComprobante> {
  const dir  = await fs.mkdtemp(path.join(os.tmpdir(), "comprobante-"))
  const base = path.join(dir, randomUUID())
  const ruta = `${base}.${tipo === "jpeg" ? "jpg" : tipo}`

  try {
    await fs.writeFile(ruta, buf)

    if (tipo === "pdf") {
      const { out, falta } = await correr("pdftotext", ["-q", "-layout", "-f", "1", "-l", "3", ruta, "-"])
      if (falta) return { texto: "", motor: "no-disponible" }
      if (out.replace(/\s+/g, " ").trim().length >= 30) return { texto: out, motor: "pdftotext" }

      // PDF escaneado: primera página a imagen y OCR.
      const { falta: faltaPpm } = await correr("pdftoppm", ["-q", "-r", "150", "-f", "1", "-l", "1", "-jpeg", ruta, base])
      if (faltaPpm) return { texto: "", motor: "no-disponible" }
      const pagina = (await fs.readdir(dir)).find(f => f.endsWith(".jpg") && f !== path.basename(ruta))
      if (!pagina) return { texto: out, motor: "pdftotext" }
      const { texto, falta: faltaOcr } = await ocrDeImagen(path.join(dir, pagina))
      return faltaOcr ? { texto: "", motor: "no-disponible" } : { texto, motor: "ocr" }
    }

    const { texto, falta } = await ocrDeImagen(ruta)
    return falta ? { texto: "", motor: "no-disponible" } : { texto, motor: "ocr" }
  } catch {
    return { texto: "", motor: "error" }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
