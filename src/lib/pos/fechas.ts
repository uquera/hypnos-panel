// Fechas de Hypnos POS en hora de Chile (America/Santiago): avisos del cron,
// días restantes y vencimientos elegidos en el panel. Sin dependencias.

export const TZ_CHILE = "America/Santiago"

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: TZ_CHILE, year: "numeric", month: "2-digit", day: "2-digit" })

/** "YYYY-MM-DD" del día calendario en Chile. */
export function claveDiaChile(d: Date): string {
  return fmtDia.format(d)
}

function diaUTC(clave: string): number {
  const [y, m, d] = clave.split("-").map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Días calendario (Chile) desde hoy hasta la fecha: 0 = vence hoy, negativo = vencido. */
export function diasHastaChile(fecha: Date, hoy = new Date()): number {
  return Math.round((diaUTC(claveDiaChile(fecha)) - diaUTC(claveDiaChile(hoy))) / 86_400_000)
}

/** Suma meses calendario conservando la hora; si el día no existe (31 → feb) usa el último del mes. */
export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimo))
  return d
}

/** Desfase de Chile en minutos para un instante dado (−180 en verano, −240 en invierno). */
function offsetChileMin(d: Date): number {
  const txt = new Intl.DateTimeFormat("en-US", { timeZone: TZ_CHILE, timeZoneName: "longOffset" })
    .formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "GMT-03:00"
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(txt)
  if (!m) return -180
  const min = Number(m[2]) * 60 + Number(m[3] ?? 0)
  return m[1] === "-" ? -min : min
}

/** "YYYY-MM-DD" → 23:59 de ese día en Chile (para vencimientos elegidos a mano). */
export function finDelDiaChile(clave: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clave)) return null
  const base = diaUTC(clave) + (23 * 60 + 59) * 60_000
  if (isNaN(base)) return null
  const guess = new Date(base)
  return new Date(base - offsetChileMin(guess) * 60_000)
}

/** "30 de octubre de 2026" en hora de Chile. */
export function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ_CHILE })
}

/** "30-10-2026" en hora de Chile. */
export function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ_CHILE })
}
