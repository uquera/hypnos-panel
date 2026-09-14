// Utilidades para vincular los leads con el respaldo de su agenda gratis.

/** Mismo slug que usa la agenda (demo/app.js): clave estable del negocio, máx. 40. */
export function slugNegocio(negocio: string): string {
  return (negocio || "").trim().slice(0, 40)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "negocio"
}

function ultimos8(tel: string): string {
  const d = (tel || "").replace(/\D/g, "")
  return d.length >= 8 ? d.slice(-8) : ""
}

type RespaldoMin = { agendaId: string; slug: string; email: string; telefono: string }
type LeadMin     = { agendaId: string; negocio: string; email: string; whatsapp: string }

/**
 * Busca el respaldo de agenda de un lead.
 * 1) por agendaId (leads nuevos, vínculo exacto);
 * 2) por slug del negocio (agendas creadas antes del respaldo: se abrieron con ?n=negocio);
 *    si hay varias con el mismo slug, desempata por correo o teléfono del perfil.
 * `respaldos` debe venir ordenado por ultimaActividad desc.
 */
export function buscarRespaldo<T extends RespaldoMin>(lead: LeadMin, respaldos: T[]): T | null {
  if (lead.agendaId) {
    const exacto = respaldos.find(r => r.agendaId === lead.agendaId)
    if (exacto) return exacto
  }

  const porSlug = respaldos.filter(r => r.slug === slugNegocio(lead.negocio))
  if (porSlug.length === 1) return porSlug[0]

  const email = (lead.email || "").toLowerCase()
  const tel   = ultimos8(lead.whatsapp)
  const coincideContacto = (r: T) =>
    (!!email && r.email.toLowerCase() === email) || (!!tel && ultimos8(r.telefono) === tel)

  if (porSlug.length > 1) return porSlug.find(coincideContacto) ?? porSlug[0]
  return null
}
