// Arma la URL pública del cliente a partir del campo "dominio",
// venga como "sunorte.cl", "https://www.sunorte.cl" o "bambu.srv.../".
export function urlSitio(dominio: string): string {
  const d = (dominio ?? "").trim()
  if (!d) return "#"
  return /^https?:\/\//i.test(d) ? d : `https://${d.replace(/^\/+/, "")}`
}
