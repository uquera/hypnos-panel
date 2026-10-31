// Llamadas del panel a la gobernanza de cada app cliente (estándar de CLAUDE.md):
//   PATCH <apiUrl>                      → sincroniza la licencia (fecha, suspensión, plan, enPrueba…)
//   POST  <apiUrl sin /licencia>/pagos  → registra un pago de licencia en la instancia
// apiUrl es la URL completa del endpoint: https://<dominio>/api/gobernanza/licencia.
// Todo es best-effort: si la instancia está caída se devuelve el error y la operación
// local (base del panel) ya quedó guardada. Sin sesión: lo usan rutas, server actions y el cron.

export interface ClienteRemoto {
  apiUrl:    string
  masterKey: string
  dominio:   string
}

export interface ResultadoRemoto {
  ok:     boolean
  error?: string
}

const TIMEOUT_MS = 10_000

export function urlPagos(apiUrl: string): string {
  return apiUrl.replace(/\/licencia\/?$/, "/pagos")
}

async function llamar(cliente: ClienteRemoto, url: string, method: "PATCH" | "POST", body: unknown): Promise<ResultadoRemoto> {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-Master-Key": cliente.masterKey },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
    if (res.ok) return { ok: true }
    return { ok: false, error: `HTTP ${res.status} al sincronizar con ${cliente.dominio}` }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error && err.name === "AbortError"
        ? `Tiempo de espera agotado conectando a ${cliente.dominio}`
        : `No se pudo conectar con ${cliente.dominio}`,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/** PATCH de la licencia en la instancia del cliente. */
export function patchLicenciaRemota(cliente: ClienteRemoto, data: Record<string, unknown>) {
  return llamar(cliente, cliente.apiUrl, "PATCH", data)
}

/** POST de un pago de licencia en la instancia del cliente. */
export function postPagoRemoto(cliente: ClienteRemoto, data: Record<string, unknown>) {
  return llamar(cliente, urlPagos(cliente.apiUrl), "POST", data)
}
