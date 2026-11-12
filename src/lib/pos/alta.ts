import { spawn } from "child_process"
import fs from "fs"
import { prisma } from "@/lib/prisma"
import { logActividad } from "@/lib/actividad"
import { basePortal, basePublica, dirLogos } from "./servidor"
import { rutaLogo, rutaClientes, type ResultadoAlta } from "./onboarding"
import { enviarInvitacion } from "./usuarios"
import { correoBienvenida, avisoHypnosErrorAlta } from "./correos"
import { errorCodigo, normalizarCodigo } from "./validacion"
import { precioMensual } from "./config"

// Alta automática de la instancia de un restaurante en <codigo>.hypnosapps.com.
// Invoca el comando del servidor (lo mantiene otra persona), con este contrato:
//   hypnos-pos-tenant create --codigo X --nombre "N" --email E --dueno "D" --master-key K --vence ISO [--prueba]
//   - tarda 1–3 min; log por stdout/stderr; la ÚLTIMA línea de stdout es JSON
//     {"ok":true,"url":"https://X.hypnosapps.com","port":3xxx} | {"ok":false,"error":"..."}; exit 0 si ok.
//   hypnos-pos-tenant status --codigo X → {"ok":true,"online":true,...}
// Ruta configurable con POS_TENANT_CMD. Si el comando no existe y NODE_ENV !== "production",
// se simula una instalación exitosa (desarrollo local).
// Corre en segundo plano dentro del proceso del panel (PM2, un solo proceso): la request
// responde al instante y el estado queda en PosCuenta.estadoAlta (PENDIENTE|INSTALANDO|LISTO|ERROR).

export const DOMINIO_POS = "hypnosapps.com"
const LOG_MAX     = 20_000           // caracteres guardados en altaLog (se conserva el final)
const TIMEOUT_MS  = 10 * 60_000      // se mata el comando a los 10 minutos
export const ALTA_ESTANCADA_MS = 15 * 60_000 // INSTALANDO más que esto = el panel se reinició a mitad

/** Subdominios que no se pueden usar como código de restaurante. */
export const CODIGOS_RESERVADOS = new Set([
  "www", "panel", "api", "pos", "pos-demo", "demo", "admin", "mail", "smtp", "imap", "pop", "ftp",
  "app", "apps", "static", "cdn", "assets", "maquetas", "hypnos", "soporte", "contacto", "blog",
  "dev", "staging", "test", "qa", "sandbox", "preview", "status", "login", "registro", "no-reply",
  "noreply", "webmail", "cpanel", "ns1", "ns2", "vpn", "landing", "agenda", "agendas",
])

function reservadosExtra(): string[] {
  return (process.env.POS_CODIGOS_RESERVADOS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
}

export function comandoTenant(): string {
  return process.env.POS_TENANT_CMD || "/usr/local/bin/hypnos-pos-tenant"
}

/** Sugerencia de código a partir del nombre del restaurante. */
export function sugerirCodigo(nombre: string): string {
  return nombre
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, "y")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-")
    .slice(0, 30).replace(/-+$/, "")
}

/**
 * Valida formato y disponibilidad del código (= subdominio). Devuelve el error o null.
 * Ocupado si: palabra reservada, otra PosCuenta lo usa, o un Cliente de la gobernanza ya
 * tiene ese subdominio de hypnosapps.com (dominio o apiUrl).
 */
export async function errorCodigoDisponible(valor: unknown, exceptoCuentaId?: string): Promise<string | null> {
  const codigo = normalizarCodigo(valor)
  const err = errorCodigo(codigo)
  if (err) return err
  if (CODIGOS_RESERVADOS.has(codigo) || reservadosExtra().includes(codigo)) return "Ese nombre está reservado. Prueba con otro."

  const host = `${codigo}.${DOMINIO_POS}`
  const [cuenta, cliente] = await Promise.all([
    prisma.posCuenta.findUnique({ where: { codigo }, select: { id: true } }),
    prisma.cliente.findFirst({
      where: { OR: [{ dominio: { contains: host } }, { apiUrl: { contains: `//${host}` } }] },
      select: { id: true, posCuentas: { select: { id: true } } },
    }),
  ])
  if (cuenta && cuenta.id !== exceptoCuentaId) return "Ese subdominio ya está en uso. Prueba con otro."
  if (cliente && !cliente.posCuentas.some(p => p.id === exceptoCuentaId)) return "Ese subdominio ya está en uso. Prueba con otro."
  return null
}

function existeComando(cmd: string): boolean {
  try {
    fs.accessSync(cmd, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function recortar(log: string): string {
  return log.length > LOG_MAX ? "…(recortado)\n" + log.slice(-LOG_MAX) : log
}

/** Última línea no vacía de stdout interpretada como JSON del contrato. */
type ResultadoCmd = { ok: boolean; url?: string; port?: number; error?: string } & ResultadoAlta
function leerResultado(stdout: string): ResultadoCmd | null {
  const lineas = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const ultima = lineas[lineas.length - 1]
  if (!ultima) return null
  try {
    const j = JSON.parse(ultima)
    return typeof j === "object" && j ? j : null
  } catch {
    return null
  }
}

// Alta en curso por cuenta, para no lanzar dos veces en el mismo proceso
const enCurso = new Set<string>()

/**
 * Marca la cuenta como INSTALANDO y lanza el comando en segundo plano. No espera el resultado.
 * Lanza Error si la cuenta no tiene lo necesario (cliente vinculado y dueño).
 */
export async function lanzarAlta(cuentaId: string): Promise<void> {
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: cuentaId },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!cuenta) throw new Error("Cuenta no encontrada")
  if (cuenta.estadoAlta === "MANUAL") throw new Error("La cuenta es de instalación manual")
  if (cuenta.eliminadaAt) throw new Error("La cuenta está eliminada")
  if (!cuenta.cliente) throw new Error("La cuenta no tiene cliente de gobernanza vinculado")
  const dueno = cuenta.usuarios[0]
  if (!dueno) throw new Error("La cuenta no tiene dueño")
  if (enCurso.has(cuentaId)) return

  // Reserva atómica: solo si no hay otra instalación viva (o quedó estancada por un reinicio)
  const estancada = new Date(Date.now() - ALTA_ESTANCADA_MS)
  const tomado = await prisma.posCuenta.updateMany({
    where: { id: cuentaId, OR: [{ estadoAlta: { not: "INSTALANDO" } }, { altaAt: { lt: estancada } }, { altaAt: null }] },
    data:  { estadoAlta: "INSTALANDO", altaAt: new Date(), altaLog: "" },
  })
  if (tomado.count === 0) return

  const cliente = cuenta.cliente
  const logo = await rutaLogo(cuenta, dirLogos())
  const clientes = rutaClientes(cuenta)
  const args = [
    "create",
    "--codigo", cuenta.codigo,
    "--nombre", cuenta.nombre,
    "--email", dueno.email,
    "--dueno", dueno.nombre,
    // sin la invitación propia del sistema: el dueño crea UNA contraseña con la del portal
    // (se sincroniza al POS) y entra con "Abrir mi sistema"
    "--sin-correo",
    "--master-key", cliente.masterKey,
    "--vence", cliente.fechaVencimiento.toISOString(),
    ...(cuenta.enPrueba ? ["--prueba"] : []),
    ...(cuenta.tipo === "ALMACEN" ? ["--tipo", "almacen"] : []),
    // Onboarding (flags opcionales del contrato ampliado)
    ...(logo ? ["--logo", logo] : []),
    ...(cuenta.menuUrl ? ["--menu-url", cuenta.menuUrl] : ["--ejemplo"]),
    "--mesas", String(cuenta.mesas),
    ...(cuenta.direccion ? ["--direccion", cuenta.direccion] : []),
    ...(cuenta.whatsapp ? ["--telefono", cuenta.whatsapp] : []),
    ...(cuenta.horario ? ["--horario", cuenta.horario] : []),
    ...(clientes ? ["--clientes", clientes] : []),
  ]
  const ocultar = (t: string) => t.split(cliente.masterKey).join("***")

  enCurso.add(cuentaId)
  const cmd = comandoTenant()

  if (!existeComando(cmd)) {
    if (process.env.NODE_ENV === "production") {
      enCurso.delete(cuentaId)
      await terminar(cuentaId, { ok: false, error: `No existe el comando ${cmd}` }, `No existe el comando ${cmd}\n`)
      return
    }
    // Desarrollo: simulación (POS_TENANT_SIMULADO_MS, default 4 s)
    const ms  = Number(process.env.POS_TENANT_SIMULADO_MS || 4000)
    const url = `https://${cuenta.codigo}.${DOMINIO_POS}`
    const log = `[simulado] ${cmd} no existe; NODE_ENV=${process.env.NODE_ENV}\n[simulado] args: ${ocultar(args.map(a => /\s/.test(a) ? JSON.stringify(a) : a).join(" "))}\n`
    // Acepta los flags de onboarding. POS_TENANT_SIMULADO_MENU=falla simula un menú que no se pudo importar.
    const sim: ResultadoCmd = {
      ok: true, url, port: 3999,
      ...(cuenta.menuUrl ? {
        menu: process.env.POS_TENANT_SIMULADO_MENU === "falla"
          ? { ok: false, productos: 0, error: "No se pudo leer el menú (simulado)" }
          : { ok: true, productos: 48 },
      } : {}),
      ...(clientes ? { clientes: { ok: true, importados: 12 } } : {}),
    }
    setTimeout(() => {
      enCurso.delete(cuentaId)
      terminar(cuentaId, sim, log + JSON.stringify(sim) + "\n")
        .catch(e => console.error("[pos-alta] simulación:", e))
    }, ms)
    return
  }

  let stdout = ""
  let log = ""
  let ultimoFlush = 0
  const flush = (forzar = false) => {
    const ahora = Date.now()
    if (!forzar && ahora - ultimoFlush < 5000) return
    ultimoFlush = ahora
    prisma.posCuenta.update({ where: { id: cuentaId }, data: { altaLog: recortar(ocultar(log)) } }).catch(() => {})
  }

  const hijo = spawn(cmd, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: process.env })
  const timer = setTimeout(() => {
    log += `\n[panel] tiempo máximo (${TIMEOUT_MS / 60000} min) agotado; se detiene el comando\n`
    hijo.kill("SIGKILL")
  }, TIMEOUT_MS)

  hijo.stdout.on("data", (b: Buffer) => {
    const t = b.toString("utf8")
    stdout = (stdout + t).slice(-LOG_MAX)
    log = (log + t).slice(-LOG_MAX * 2)
    flush()
  })
  hijo.stderr.on("data", (b: Buffer) => {
    log = (log + b.toString("utf8")).slice(-LOG_MAX * 2)
    flush()
  })

  let cerrado = false
  const alCerrar = (code: number | null, errorSpawn?: Error) => {
    if (cerrado) return
    cerrado = true
    clearTimeout(timer)
    enCurso.delete(cuentaId)
    if (errorSpawn) log += `\n[panel] no se pudo ejecutar: ${errorSpawn.message}\n`
    const r = leerResultado(stdout)
    const ok = !errorSpawn && code === 0 && r?.ok === true && typeof r.url === "string"
    const resultado: ResultadoCmd = ok
      ? { ok: true, url: r!.url, port: r!.port, menu: r!.menu, clientes: r!.clientes }
      : { ok: false, error: r?.error || (errorSpawn ? errorSpawn.message : `El comando terminó con código ${code}`) }
    terminar(cuentaId, resultado, ocultar(log)).catch(e => console.error("[pos-alta] terminar:", e))
  }
  hijo.on("error", e => alCerrar(null, e))
  hijo.on("close", code => alCerrar(code))
}

/** Guarda el resultado y avisa (bienvenida al dueño o error a Hypnos). */
async function terminar(cuentaId: string, r: ResultadoCmd, log: string) {
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: cuentaId },
    include: { cliente: true, usuarios: { where: { rol: "DUENO" }, orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (!cuenta) return
  const base = basePublica()
  const linkFicha = `${base}/admin/pos/${cuenta.id}`

  if (!r.ok || !r.url) {
    const error = r.error || "Error desconocido"
    await prisma.posCuenta.update({
      where: { id: cuentaId },
      data:  { estadoAlta: "ERROR", altaLog: recortar(`${log}\n[panel] ERROR: ${error}`) },
    })
    await logActividad({
      usuarioId: "sistema", usuarioNombre: "Hypnos POS", clienteId: cuenta.clienteId ?? undefined,
      clienteNombre: cuenta.nombre, accion: "POS_ALTA_ERROR", detalle: `${cuenta.codigo}: ${error.slice(0, 200)}`,
    })
    await avisoHypnosErrorAlta({ restaurante: cuenta.nombre, codigo: cuenta.codigo, error, linkFicha })
      .catch(e => console.error("[pos-alta] aviso de error:", e))
    return
  }

  // La URL que entrega el comando es la base; apiUrl es el endpoint completo (estándar del panel)
  const url = r.url.replace(/\/+$/, "")
  // Resultado de la importación (menú y clientes) que puede traer la última línea JSON
  const resultadoAlta: ResultadoAlta = {
    ...(r.menu ? { menu: { ok: !!r.menu.ok, productos: Number(r.menu.productos) || 0, ...(r.menu.error ? { error: String(r.menu.error).slice(0, 300) } : {}) } } : {}),
    ...(r.clientes ? { clientes: { ok: !!r.clientes.ok, importados: Number(r.clientes.importados) || 0, ...(r.clientes.error ? { error: String(r.clientes.error).slice(0, 300) } : {}) } } : {}),
  }
  const host = (() => { try { return new URL(url).host } catch { return `${cuenta.codigo}.${DOMINIO_POS}` } })()
  await prisma.$transaction([
    prisma.posCuenta.update({
      where: { id: cuentaId },
      data:  {
        estadoAlta: "LISTO", posUrl: url, resultadoAlta: JSON.stringify(resultadoAlta),
        altaLog: recortar(`${log}\n[panel] LISTO: ${url}${r.port ? ` (puerto ${r.port})` : ""}`),
      },
    }),
    ...(cuenta.clienteId ? [prisma.cliente.update({
      where: { id: cuenta.clienteId },
      data:  { apiUrl: `${url}/api/gobernanza/licencia`, dominio: host },
    })] : []),
  ])
  await logActividad({
    usuarioId: "sistema", usuarioNombre: "Hypnos POS", clienteId: cuenta.clienteId ?? undefined,
    clienteNombre: cuenta.nombre, accion: "POS_ALTA_LISTA", detalle: `${cuenta.codigo} → ${url}`,
  })

  const dueno = cuenta.usuarios[0]
  if (!dueno) return
  try {
    await correoBienvenida({
      to: dueno.email, dueno: dueno.nombre, restaurante: cuenta.nombre, url,
      enPrueba: cuenta.enPrueba, vence: cuenta.cliente?.fechaVencimiento ?? new Date(), linkPago: `${basePortal()}/pos/pago`,
      monto: cuenta.precioMensual ?? precioMensual(),
      mesas: cuenta.mesas, menuUrl: cuenta.menuUrl, resultado: resultadoAlta, almacen: cuenta.tipo === "ALMACEN",
    })
  } catch (e) {
    console.error("[pos-alta] bienvenida:", e)
  }
  // Invitación al portal (pagos y marca) solo si aún no creó su contraseña
  if (!dueno.passwordHash) {
    await enviarInvitacion(dueno.id, "Hypnos", basePortal()).catch(e => console.error("[pos-alta] invitación:", e))
  }
}

/** hypnos-pos-tenant status --codigo X (o simulado en desarrollo). */
export async function estadoInstancia(codigo: string): Promise<{ ok: boolean; online?: boolean; error?: string; [k: string]: unknown }> {
  const cmd = comandoTenant()
  if (!existeComando(cmd)) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, error: `No existe el comando ${cmd}` }
      : { ok: true, online: true, simulado: true }
  }
  return new Promise(resolve => {
    let out = ""
    const hijo = spawn(cmd, ["status", "--codigo", codigo], { shell: false, stdio: ["ignore", "pipe", "ignore"] })
    const t = setTimeout(() => hijo.kill("SIGKILL"), 20_000)
    hijo.stdout.on("data", (b: Buffer) => { out = (out + b.toString("utf8")).slice(-10_000) })
    hijo.on("error", e => { clearTimeout(t); resolve({ ok: false, error: e.message }) })
    hijo.on("close", () => {
      clearTimeout(t)
      resolve((leerResultado(out) as { ok: boolean }) ?? { ok: false, error: "Respuesta no válida del comando" })
    })
  })
}

/**
 * hypnos-pos-tenant destroy --codigo X --confirmar X: respalda la base de la instancia
 * (/var/backups/hypnos-pos) y la saca de línea. Espera el resultado (máx. 5 min).
 */
export async function eliminarInstancia(codigo: string): Promise<{ ok: boolean; error?: string; log: string }> {
  const cmd = comandoTenant()
  if (!existeComando(cmd)) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, error: `No existe el comando ${cmd}`, log: "" }
      : { ok: true, log: `[simulado] destroy --codigo ${codigo}\n` }
  }
  return new Promise(resolve => {
    let out = "", log = ""
    const hijo = spawn(cmd, ["destroy", "--codigo", codigo, "--confirmar", codigo], { shell: false, stdio: ["ignore", "pipe", "pipe"] })
    const t = setTimeout(() => { log += "\n[panel] tiempo agotado (5 min)\n"; hijo.kill("SIGKILL") }, 5 * 60_000)
    hijo.stdout.on("data", (b: Buffer) => { const x = b.toString("utf8"); out = (out + x).slice(-LOG_MAX); log = (log + x).slice(-LOG_MAX) })
    hijo.stderr.on("data", (b: Buffer) => { log = (log + b.toString("utf8")).slice(-LOG_MAX) })
    hijo.on("error", e => { clearTimeout(t); resolve({ ok: false, error: e.message, log }) })
    hijo.on("close", code => {
      clearTimeout(t)
      const r = leerResultado(out)
      if (code === 0 && r?.ok === true) resolve({ ok: true, log })
      else resolve({ ok: false, error: r?.error || `El comando terminó con código ${code}`, log })
    })
  })
}
