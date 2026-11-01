// Detección de gastos repetidos dentro del mismo mes.
//
// El caso real: "Capcut · Membresía de capcut" y "capcut pro · Pago de
// mensualidad capcut", $19 los dos, el mismo mes. Para el ojo es obvio; para
// un `===` son textos distintos. Aquí se normaliza el concepto, se botan las
// palabras de relleno ("pago", "mensualidad", "pro", "plan"…) y se compara lo
// que queda, tolerando plurales y erratas de una o dos letras.
//
// Se usa en los dos lados: el servidor bloquea (409) y el formulario avisa
// mientras se escribe. Sin dependencias para poder importarlo en ambos.

// Palabras que no distinguen un gasto de otro.
const RELLENO = new Set([
  "a", "al", "ante", "con", "de", "del", "e", "el", "en", "la", "las", "lo", "los",
  "o", "para", "por", "un", "una", "unos", "unas", "y",
  "pago", "pagos", "pagar", "pagada", "pagado", "abono", "compra", "comprado",
  "cuota", "cobro", "cargo", "factura", "boleta", "recibo", "gasto",
  "mensualidad", "mensualidades", "mensual", "anual", "anualidad", "trimestral",
  "membresia", "membresias", "suscripcion", "suscripciones", "subscripcion",
  "renovacion", "renovaciones", "licencia", "licencias", "plan", "planes",
  "cuenta", "cuentas", "servicio", "servicios", "software", "app", "aplicacion",
  "pro", "plus", "premium", "basico", "basica", "standard", "estandar", "full",
  "mes", "meses", "ano", "anos", "año", "años", "dia", "dias", "semana", "semanas",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
])

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // quita tildes
    .replace(/[^a-z0-9\s]/g, " ")                        // puntuación fuera
    .replace(/\s+/g, " ")
    .trim()
}

// Tokens que sí identifican el gasto. Si al quitar el relleno no queda nada
// (p. ej. el concepto es literalmente "Mensualidad"), se devuelve todo.
export function tokensClave(texto: string): string[] {
  const todos = normalizar(texto).split(" ").filter(Boolean)
  const utiles = todos.filter(t => !RELLENO.has(t) && t.length > 1)
  return utiles.length > 0 ? utiles : todos
}

function distancia(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (m === 0 || n === 0) return Math.max(m, n)
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const fila = [i]
    for (let j = 1; j <= n; j++) {
      fila[j] = Math.min(
        prev[j] + 1,
        fila[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = fila
  }
  return prev[n]
}

// "capcut" ≈ "capcuts" ≈ "capcutt"; "vps" ≠ "aws".
function mismoToken(a: string, b: string): boolean {
  if (a === b) return true
  const corto = a.length <= b.length ? a : b
  const largo = a.length <= b.length ? b : a
  if (corto.length >= 4 && largo.startsWith(corto)) return true
  const tolerancia = largo.length <= 5 ? 0 : largo.length <= 8 ? 1 : 2
  return tolerancia > 0 && distancia(a, b) <= tolerancia
}

// Coeficiente de Dice sobre los tokens clave: 1 = mismo concepto.
// Caso aparte: cuando el concepto corto está entero dentro del largo
// ("Gemini" dentro de "Gemini Doña Any") Dice castiga de más, así que esa
// contención vale por sí sola — siempre que lo compartido sea una palabra con
// cuerpo, para que "Vps" no arrastre a cualquier otro VPS.
function parecido(a: string, b: string): number {
  const ta = tokensClave(a), tb = tokensClave(b)
  if (ta.length === 0 || tb.length === 0) return 0

  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const libres = [...largo]
  const emparejados: string[] = []
  for (const t of corto) {
    const i = libres.findIndex(u => mismoToken(t, u))
    if (i >= 0) { emparejados.push(t); libres.splice(i, 1) }
  }

  const dice = (2 * emparejados.length) / (ta.length + tb.length)
  const contenido = emparejados.length === corto.length
    && emparejados.some(t => t.length >= 4)
  return contenido ? Math.max(dice, 0.75) : dice
}

export interface GastoComparable {
  id:        string
  concepto:  string
  notas?:    string | null
  monto:     number
  moneda:    string
  fecha:     string | Date
  categoria?: string
  quien?:    string      // quién lo pagó, para mostrarlo en el aviso
}

export interface Similar {
  gasto:      GastoComparable
  score:      number
  mismoMonto: boolean
}

// A partir de 0.6 dos conceptos se consideran el mismo gasto.
export const UMBRAL = 0.6

export function mesDe(fecha: string | Date): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

// El concepto manda; las notas son un refuerzo (penalizado) para cuando el
// concepto es genérico y el detalle real está ahí.
export function similitud(
  a: { concepto: string; notas?: string | null },
  b: { concepto: string; notas?: string | null },
): number {
  const directo = parecido(a.concepto, b.concepto)
  if (!a.notas && !b.notas) return directo
  const conNotas = parecido(`${a.concepto} ${a.notas ?? ""}`, `${b.concepto} ${b.notas ?? ""}`)
  return Math.max(directo, conNotas * 0.9)
}

// Gastos del mismo mes que parecen ser este mismo gasto, el más probable
// primero (mismo monto pesa más que el parecido del texto).
export function buscarSimilares(
  nuevo: { concepto: string; notas?: string | null; monto: number; moneda: string; fecha: string | Date },
  gastos: GastoComparable[],
  excluirId?: string,
): Similar[] {
  if (!nuevo.concepto.trim()) return []
  const mes = mesDe(nuevo.fecha)

  return gastos
    .filter(g => g.id !== excluirId && mesDe(g.fecha) === mes)
    .map(g => ({
      gasto: g,
      score: similitud(nuevo, g),
      mismoMonto: g.moneda === nuevo.moneda && Math.abs(g.monto - nuevo.monto) < 0.005,
    }))
    .filter(s => s.score >= UMBRAL)
    .sort((a, b) => (Number(b.mismoMonto) - Number(a.mismoMonto)) || (b.score - a.score))
}

// Pares ya guardados que casi con seguridad son el mismo gasto cargado dos
// veces: concepto parecido, mismo mes Y mismo monto. Sirve para el aviso del
// listado, por eso exige el monto: ahí no hay nadie confirmando nada.
export function paresDuplicados(gastos: GastoComparable[]): [GastoComparable, GastoComparable][] {
  const pares: [GastoComparable, GastoComparable][] = []
  const porMes = new Map<string, GastoComparable[]>()
  for (const g of gastos) {
    const k = mesDe(g.fecha)
    porMes.set(k, [...(porMes.get(k) ?? []), g])
  }
  for (const delMes of porMes.values()) {
    for (let i = 0; i < delMes.length; i++) {
      for (let j = i + 1; j < delMes.length; j++) {
        const a = delMes[i], b = delMes[j]
        if (a.moneda !== b.moneda || Math.abs(a.monto - b.monto) >= 0.005) continue
        if (similitud(a, b) < UMBRAL) continue
        pares.push(new Date(a.fecha) >= new Date(b.fecha) ? [b, a] : [a, b])
      }
    }
  }
  return pares
}
