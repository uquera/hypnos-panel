// Estados del embudo de leads.
// Vive fuera de las rutas API porque Next.js solo admite exports conocidos
// (GET, POST, dynamic…) en un route.ts: cualquier otro rompe el build.

export const ESTADOS = ["NUEVO", "CONTACTADO", "EN_CONVERSACION", "GANADO", "PERDIDO"] as const

export type Estado = typeof ESTADOS[number]

export function esEstado(v: unknown): v is Estado {
  return typeof v === "string" && (ESTADOS as readonly string[]).includes(v)
}

export const ESTADO_META: Record<Estado, { label: string; badge: string; dot: string }> = {
  NUEVO:           { label: "Nuevo",           badge: "bg-indigo-100 text-indigo-700",   dot: "bg-indigo-500" },
  CONTACTADO:      { label: "Contactado",      badge: "bg-sky-100 text-sky-700",         dot: "bg-sky-500" },
  EN_CONVERSACION: { label: "En conversación", badge: "bg-amber-100 text-amber-700",     dot: "bg-amber-500" },
  GANADO:          { label: "Ganado",          badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  PERDIDO:         { label: "Perdido",         badge: "bg-gray-200 text-gray-600",       dot: "bg-gray-400" },
}
