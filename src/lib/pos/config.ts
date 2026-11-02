// Configuración comercial de Hypnos POS (variables de entorno del servidor, sin rebuild).
//   POS_PRECIO_MENSUAL       monto mensual en CLP (default 20000)
//   POS_DATOS_TRANSFERENCIA  texto multilínea con banco, tipo de cuenta, número, RUT, nombre y correo
//                            (en .env se puede escribir con \n literales entre comillas)
//   POS_DIAS_GRACIA          días después del vencimiento antes de suspender (default 3)
//   POS_DIAS_PRUEBA          días de prueba gratis del registro público (default 7)
//   POS_AVISOS_EMAIL         a quién avisa el panel (registros, comprobantes, errores); default contacto@

export const CORREO_CONTACTO = "contacto@hypnosapps.com"

function entero(v: string | undefined, def: number, min = 0): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= min ? Math.round(n) : def
}

export function precioMensual(): number {
  return entero(process.env.POS_PRECIO_MENSUAL, 20_000, 1)
}

export function diasGracia(): number {
  return entero(process.env.POS_DIAS_GRACIA, 3)
}

export function diasPrueba(): number {
  return entero(process.env.POS_DIAS_PRUEBA, 7, 1)
}

/** Datos de transferencia o null si no están configurados. */
export function datosTransferencia(): string | null {
  const t = (process.env.POS_DATOS_TRANSFERENCIA ?? "").replace(/\\n/g, "\n").trim()
  return t || null
}

export function correoAvisosHypnos(): string {
  return process.env.POS_AVISOS_EMAIL || CORREO_CONTACTO
}

export function formatoCLP(n: number): string {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n)
}

/** Dígitos para wa.me (asume Chile si viene un celular de 9 dígitos sin código de país). */
export function whatsappDigitos(v: string): string {
  let d = v.replace(/\D/g, "")
  if (d.length === 9 && d.startsWith("9")) d = "56" + d
  if (d.length === 8) d = "569" + d
  return d
}
