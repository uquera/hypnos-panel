// ¿El archivo adjunto acredita de verdad el gasto?
//
// El caso real: se subían recortes de pantalla cualquiera (un trozo de
// conversación, media ventana, un panel) que no acreditan nada. La idea NO es
// exigir una factura tributaria: basta con que el documento se vea como un
// comprobante de pago. Dos capas:
//
//   1. `revisarArchivo`: el archivo es de verdad del tipo que dice y mide lo
//      suficiente para leerse.
//   2. `revisarTexto`: sobre el texto extraído del PDF o del OCR de la imagen
//      se buscan señales de comprobante — el monto escrito como dinero, una
//      línea de importe ("Total: $19"), vocabulario de comprobante, el nombre
//      del proveedor, una fecha del período, un folio etiquetado.
//
// Los pesos y el umbral están calibrados contra los 74 comprobantes que ya
// estaban cargados en el panel (gastos e ingresos) y contra capturas de
// pantalla completas que no son comprobantes. Dos detalles que salieron de esa
// calibración y que importan:
//
//   · El monto solo cuenta si está escrito COMO DINERO ("$19", "19,00 US$"):
//     un "10" suelto aparece en cualquier pantallazo.
//   · El umbral sube con el largo del texto. Un recibo real es corto y denso;
//     una captura de todo el escritorio trae 3.500 caracteres donde cualquier
//     palabra suelta coincide por azar.
//
// Nada de esto borra lo que el usuario quiere guardar: si el documento sale
// débil o no se pudo leer, el servidor avisa y deja confirmar — y el gasto
// queda marcado como "comprobante sin verificar" para que se vea en la lista.
//
// Sin dependencias: lo usa el servidor y el formulario reutiliza las listas
// para explicar qué falta.

import { normalizar, tokensClave } from "@/lib/duplicados"

export type TipoArchivo = "jpeg" | "png" | "webp" | "pdf"

export const MIME_POR_TIPO: Record<TipoArchivo, string> = {
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  pdf:  "application/pdf",
}

// Un comprobante real pesa y mide algo. Un recorte de una línea de pantalla no.
export const MIN_BYTES      = 6 * 1024
export const MIN_LADO_CORTO = 180      // px
export const MIN_PIXELES    = 150_000  // ~ 500×300; da igual la orientación

export interface RevisionArchivo {
  tipo:   TipoArchivo | null
  bytes:  number
  dim:    { w: number; h: number } | null
  /** Archivo que no es un documento: no hay nada que confirmar, se rechaza. */
  invalido: string | null
  /** Es un documento, pero demasiado chico para acreditar: se puede confirmar. */
  recorte:  string | null
}

// Por la firma del archivo, no por lo que diga el navegador.
export function detectarTipo(buf: Buffer): TipoArchivo | null {
  if (buf.length < 12) return null
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg"
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png"
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp"
  if (buf.subarray(0, 5).toString("ascii") === "%PDF-") return "pdf"
  return null
}

// Dimensiones leyendo las cabeceras a mano (no vale una dependencia por esto).
export function dimensiones(buf: Buffer, tipo: TipoArchivo): { w: number; h: number } | null {
  try {
    if (tipo === "png") {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
    }
    if (tipo === "webp") {
      const formato = buf.subarray(12, 16).toString("ascii")
      if (formato === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 }
      if (formato === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
      if (formato === "VP8L") {
        const bits = buf.readUInt32LE(21)
        return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
      }
      return null
    }
    if (tipo === "jpeg") {
      // Recorre los marcadores hasta el SOFn, que es el que trae el tamaño.
      let i = 2
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue }
        const marca = buf[i + 1]
        if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue }
        const largo = buf.readUInt16BE(i + 2)
        const esSOF = marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc
        if (esSOF) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }
        i += 2 + largo
      }
    }
  } catch { /* cabecera rara: se trata como desconocida */ }
  return null
}

export function revisarArchivo(buf: Buffer, nombre: string): RevisionArchivo {
  const tipo = detectarTipo(buf)
  const base: RevisionArchivo = { tipo, bytes: buf.length, dim: null, invalido: null, recorte: null }

  if (!tipo) {
    const ext = (nombre.split(".").pop() ?? "").toLowerCase()
    return { ...base, invalido: `El archivo no es un PDF ni una imagen válida${ext && ext.length <= 5 ? ` (llegó como .${ext})` : ""}. Sube el comprobante en PDF, JPG, PNG o WebP.` }
  }
  // Un PDF no se mide por tamaño: hay recibos legítimos de menos de 1 KB. Si
  // viene vacío o cortado se nota después, al no poder sacarle texto.
  if (tipo === "pdf") return base

  const dim    = dimensiones(buf, tipo)
  const conDim = { ...base, dim }
  if (buf.length < MIN_BYTES) {
    return { ...conDim, recorte: `La imagen pesa ${Math.round(buf.length / 1024)} KB: es un recorte muy chico para acreditar un pago.` }
  }
  if (dim && (Math.min(dim.w, dim.h) < MIN_LADO_CORTO || dim.w * dim.h < MIN_PIXELES)) {
    return { ...conDim, recorte: `La imagen mide ${dim.w}×${dim.h} px: es el recorte de un trozo de pantalla, no el comprobante completo.` }
  }
  return conDim
}

// ─── Señales de que el documento es un comprobante ───────────────────────────

const MONEDA = String.raw`(?:us\$|u\$s|\$|usd|clp|eur|€)`

// Vocabulario de comprobante, en español y en inglés (casi todas las
// suscripciones mandan el recibo en inglés).
const VOCABULARIO = [
  "total", "subtotal", "neto", "iva", "impuesto", "monto", "importe",
  "comprobante", "boleta", "factura", "recibo", "pagado", "pagada", "pagaste",
  "transferencia", "transaccion", "transferiste", "cobro", "cobrado", "abono",
  "tarjeta", "credito", "debito", "suscripcion", "renovacion", "medio de pago",
  "invoice", "receipt", "paid", "payment", "billed", "billing", "charged",
  "amount", "subscription", "renewal", "order", "transaction", "card",
  "visa", "mastercard", "paypal", "mercado pago",
]

// Palabras que delatan un pantallazo de conversación en vez de un comprobante.
const PALABRAS_CHAT = [
  "escribe un mensaje", "ultima vez hoy", "escribiendo",
  "type a message", "last seen", "typing",
]

export interface Senal { clave: string; label: string; peso: number; evidencia?: string }

export interface RevisionTexto {
  senales:   Senal[]
  faltan:    string[]
  puntaje:   number
  exigido:   number
  veredicto: "ok" | "debil" | "ilegible"
}

// Mínimo de texto para considerar que se pudo leer el documento.
const MIN_CARACTERES = 30

// Cuántos puntos se exigen según el largo del texto: mientras más texto trae
// el documento, más fácil es que una palabra coincida por casualidad.
export function puntajeExigido(largo: number): number {
  if (largo <= 500)  return 2
  if (largo <= 1200) return 3
  return 4
}

// El número del gasto escrito en cualquiera de sus formas: 54.72 → "54,72";
// 128115 → "128.115"; 19 → "19", "19.00".
function variantesMonto(monto: number): string[] {
  const v = new Set<string>()
  const entero = Math.trunc(monto)
  const esc = (s: string) => s.replace(/\./g, "[.,]")
  if (Math.abs(monto - entero) < 0.005) {
    v.add(String(entero))
    if (entero >= 1000) v.add(String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, "[.,]"))
  } else {
    v.add(esc(monto.toFixed(2)))
    if (monto.toFixed(2).endsWith("0")) v.add(esc(monto.toFixed(1)))
  }
  return [...v]
}

// El monto, pero escrito COMO DINERO: con símbolo de moneda al lado o con
// separador de miles/decimales. Devuelve el trozo encontrado, para mostrarlo.
export function montoComoDinero(texto: string, monto: number): string | null {
  for (const n of variantesMonto(monto)) {
    const cola = String.raw`(?:[.,]0{1,2})?(?!\d)`        // admite "19.00" y "128.115.-"
    const candidatos = [
      new RegExp(`${MONEDA}\\s*${n}${cola}`, "i"),
      new RegExp(`(?<![\\d.,])${n}${cola}\\s*${MONEDA}`, "i"),
      ...(/\[\.,\]/.test(n) ? [new RegExp(`(?<![\\d.,])${n}${cola}`, "i")] : []),
    ]
    for (const re of candidatos) {
      const m = texto.match(re)
      if (m) return m[0].trim()
    }
  }
  return null
}

// Una línea de importe: palabra de pago pegada a una cifra. "Total: $19.00",
// "Monto transferido $50.000", "Amount paid 44.00".
export function lineaDeImporte(texto: string): string | null {
  const re = new RegExp(
    String.raw`(total|subtotal|amount(?:\s+paid|\s+due)?|monto(?:\s+\w+)?|importe(?:\s+\w+)?|pagado|pagaste|paid|charged|cobrado|neto|transferiste)` +
    String.raw`[^\n]{0,28}?${MONEDA}?\s*\d[\d.,]*`,
    "i",
  )
  const m = texto.match(re)
  return m ? m[0].replace(/\s+/g, " ").slice(0, 60) : null
}

const MESES    = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
const MESES_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

// ¿Hay alguna fecha cerca de la del gasto? Vale el día exacto en cualquier
// formato o, más laxo, el mes y el año escritos con palabras.
export function fechaCercana(texto: string, fecha: Date, diasTolerancia = 45): boolean {
  const limite = diasTolerancia * 86400_000
  const cerca  = (d: Date) => Math.abs(d.getTime() - fecha.getTime()) <= limite

  for (const m of texto.matchAll(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g)) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])]
    const anio = c < 100 ? 2000 + c : c
    // Sin saber el formato, se prueban las dos lecturas (dd/mm y mm/dd).
    for (const [dia, mes] of [[a, b], [b, a]]) {
      if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 && cerca(new Date(Date.UTC(anio, mes - 1, dia)))) return true
    }
  }
  for (const m of texto.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    if (cerca(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))))) return true
  }

  const patron = new RegExp(
    `\\b(?:(\\d{1,2})\\s*(?:de\\s*)?)?(${[...MESES, ...MESES_EN].join("|")})[a-z]*\\.?,?\\s*(?:de\\s*)?(\\d{1,2})?,?\\s*(\\d{4})\\b`,
    "gi",
  )
  for (const m of texto.matchAll(patron)) {
    const nombre = m[2].toLowerCase()
    const mes    = MESES.indexOf(nombre) >= 0 ? MESES.indexOf(nombre) : MESES_EN.indexOf(nombre.slice(0, 3))
    if (mes < 0) continue
    const anio = Number(m[4])
    const dia  = Number(m[1] ?? 0) || Number(m[3] ?? 0)
    if (dia >= 1 && dia <= 31) {
      if (cerca(new Date(Date.UTC(anio, mes, dia)))) return true
    } else if (anio === fecha.getUTCFullYear() && mes === fecha.getUTCMonth()) {
      return true   // "Julio 2026" sin día: cuenta igual
    }
  }
  return false
}

// Folio, orden u operación — solo si viene ETIQUETADO. Un número largo
// cualquiera no sirve: cualquier captura de pantalla tiene varios.
export function folioEtiquetado(texto: string): string | null {
  const m = texto.match(
    /\b(?:n[°ºo]\.?|nro\.?|folio|invoice|receipt|order|orden|transacci[oó]n|operaci[oó]n|comprobante|referencia)\s*(?:number|n[°º]|#|:|\.|-)?\s*([a-z0-9][a-z0-9-]{3,})/i,
  )
  return m ? m[0].replace(/\s+/g, " ").slice(0, 40) : null
}

export function revisarTexto(
  texto: string,
  ctx: { concepto: string; monto: number; moneda: string; fecha: Date },
): RevisionTexto {
  const limpio = texto.replace(/\s+/g, " ").trim()
  const exigido = puntajeExigido(limpio.length)
  if (limpio.length < MIN_CARACTERES) {
    return { senales: [], faltan: [], puntaje: 0, exigido, veredicto: "ilegible" }
  }

  const norm = normalizar(limpio)
  const senales: Senal[] = []
  const faltan:  string[] = []

  const dinero = montoComoDinero(limpio, ctx.monto)
  if (dinero) senales.push({ clave: "monto", label: "el monto del gasto", peso: 3, evidencia: dinero })
  else faltan.push(`el monto (${ctx.moneda} ${ctx.monto})`)

  const linea = lineaDeImporte(limpio)
  if (linea) senales.push({ clave: "importe", label: "una línea de importe", peso: 2, evidencia: linea })
  else if (!dinero) faltan.push("una línea con el total pagado")

  const vocabulario = VOCABULARIO.filter(p => norm.includes(p))
  if (vocabulario.length >= 3)      senales.push({ clave: "vocabulario", label: "palabras de comprobante", peso: 2, evidencia: vocabulario.slice(0, 4).join(", ") })
  else if (vocabulario.length >= 1) senales.push({ clave: "vocabulario", label: "palabras de comprobante", peso: 1, evidencia: vocabulario.join(", ") })
  else faltan.push("palabras propias de un comprobante (total, pagado, recibo, invoice…)")

  const claves = tokensClave(ctx.concepto).filter(t => t.length >= 4)
  const prov   = claves.find(t => norm.includes(t))
  if (prov) senales.push({ clave: "proveedor", label: "el nombre del proveedor", peso: 1, evidencia: prov })
  else if (claves.length > 0) faltan.push(`el nombre del proveedor (${claves[0]})`)

  if (fechaCercana(limpio, ctx.fecha)) senales.push({ clave: "fecha", label: "una fecha del período", peso: 1 })
  else faltan.push("una fecha cercana a la del gasto")

  const folio = folioEtiquetado(limpio)
  if (folio) senales.push({ clave: "folio", label: "un número de operación", peso: 1, evidencia: folio })

  const chat    = PALABRAS_CHAT.some(p => norm.includes(p))
  const puntaje = senales.reduce((s, x) => s + x.peso, 0) - (chat ? 3 : 0)

  return { senales, faltan, puntaje, exigido, veredicto: puntaje >= exigido ? "ok" : "debil" }
}

// Resumen corto para guardar en el gasto y mostrarlo en la lista.
export function resumenSenales(r: RevisionTexto): string {
  if (r.veredicto === "ilegible") return "no se pudo leer el documento"
  return r.senales.map(s => s.clave).join(", ") || "sin señales"
}
