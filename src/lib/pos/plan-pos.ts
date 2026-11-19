// Planes de Hypnos POS que la gobernanza manda a cada local en la licencia (campo plan).
// El POS enciende con PRO (o ENTERPRISE) el Club de Puntos y WhatsApp con IA; con BASICO muestra la
// publicidad del Plan Pro. Excepciones de prueba: MODULOS_CONTRATADOS en el tenant.env del local.

export const PLANES_POS = {
  BASICO: { nombre: "Plan Básico", precio: 20000, incluye: "POS completo" },
  PRO: { nombre: "Plan Pro", precio: 40000, incluye: "Club de Puntos + WhatsApp con IA" },
} as const

export type PlanPos = keyof typeof PLANES_POS

export const parsePlanPos = (v: unknown): PlanPos | null => {
  const p = String(v ?? "").trim().toUpperCase()
  return p === "BASICO" || p === "PRO" ? p : null
}
