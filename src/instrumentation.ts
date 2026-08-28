// Instrumentación de arranque del servidor (Next.js la ejecuta una vez).
//
// Fix de gobernanza: el VPS publica los subdominios *.srv1485601.hstgr.cloud
// con registro AAAA (IPv6) hacia un edge cuyo certificado NO corresponde al
// host (ERR_TLS_CERT_ALTNAME_INVALID). Por IPv4, nginx sirve el certificado
// Let's Encrypt correcto (HTTP 200). Node ≥17 resuelve IPv6 primero por
// defecto, así que TODOS los fetch de gobernanza (health-check, sync, pagos)
// hacia los clientes fallaban. Forzamos IPv4-first para restaurarlos.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dns = await import("node:dns")
    dns.setDefaultResultOrder("ipv4first")
  }
}
