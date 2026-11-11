/**
 * Prueba del callback de pago en línea TUU (renovación de licencia) SOLO sobre la cuenta "prueba-lasanas".
 *
 * Uso (en el VPS, desde la carpeta del panel, con el panel corriendo):
 *   npx tsx scripts/tuu-callback-prueba.ts                         # panel en http://127.0.0.1:$PORT (3000)
 *   npx tsx scripts/tuu-callback-prueba.ts --url http://127.0.0.1:3005
 *
 * Crea un cobro PENDIENTE de 1 mes para prueba-lasanas y le envía al callback, firmados con la llave
 * del .env (nunca se imprime): firma inválida (espera 400), monto alterado (200, no renueva),
 * pago válido (200, renueva 1 mes) y el mismo pago repetido (200, no renueva de nuevo).
 * Solo corre con TUU_ONLINE_ENV=test. Deja a prueba-lasanas con 1 mes más de licencia y 1 Pago de prueba.
 */

import "dotenv/config"
import { randomBytes } from "crypto"
import { prisma } from "../src/lib/prisma"
import { tuuSign } from "../src/lib/tuu-online"
import { montoPlan, RUTA_CALLBACK } from "../src/lib/pos/cobro-online"
import { precioDe } from "../src/lib/pos/cobro"
import { claveDiaChile } from "../src/lib/pos/fechas"

const CODIGO = "prueba-lasanas" // no cambiar: nunca se prueba sobre cuentas de clientes reales

function argUrl(): string {
  const i = process.argv.indexOf("--url")
  const u = i > 0 ? process.argv[i + 1] : `http://127.0.0.1:${process.env.PORT ?? 3000}`
  return (u ?? "").replace(/\/+$/, "")
}

async function main() {
  const env = process.env.TUU_ONLINE_ENV?.trim()
  const secret = process.env.TUU_ONLINE_SECRET?.trim()
  const account = process.env.TUU_ONLINE_ACCOUNT_ID?.trim()
  if (env !== "test") throw new Error("Este script solo corre con TUU_ONLINE_ENV=test")
  if (!secret || !account) throw new Error("Faltan TUU_ONLINE_ACCOUNT_ID / TUU_ONLINE_SECRET en el .env")

  const cuenta = await prisma.posCuenta.findUnique({ where: { codigo: CODIGO }, include: { cliente: true } })
  if (!cuenta?.cliente) throw new Error(`La cuenta ${CODIGO} no existe o no tiene licencia (Cliente) asociada`)

  const monto = await montoPlan(precioDe(cuenta), 1)
  if (!monto) throw new Error("No se pudo calcular el monto del plan mensual")
  const periodo = claveDiaChile(cuenta.cliente.fechaVencimiento)
  const referencia = `HP-${periodo.replace(/-/g, "")}-${randomBytes(5).toString("hex").toUpperCase()}`
  await prisma.posCobroOnline.create({ data: { referencia, cuentaId: cuenta.id, periodo, meses: 1, monto, origen: "LINK", ambiente: "test" } })

  const url = `${argUrl()}${RUTA_CALLBACK}`
  const base: Record<string, string> = {
    x_account_id: account, x_amount: String(monto), x_currency: "CLP", x_reference: referencia,
    x_result: "completed", x_timestamp: new Date().toISOString(), x_message: "prueba",
  }
  const enviar = async (campos: Record<string, string>, firmar = true) => {
    const body = { ...campos }
    if (firmar) body.x_signature = tuuSign(body, secret)
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() })
    return r.status
  }
  const estado = async () => {
    const c = await prisma.cliente.findUniqueOrThrow({ where: { id: cuenta.clienteId! } })
    const cobro = await prisma.posCobroOnline.findUniqueOrThrow({ where: { referencia } })
    return { venc: c.fechaVencimiento.toISOString(), cobro: cobro.estado, pagos: await prisma.pago.count({ where: { clienteId: c.id } }) }
  }

  let fallas = 0
  const check = (nombre: string, ok: boolean, detalle: unknown) => {
    if (!ok) fallas++
    console.log(`${ok ? "OK   " : "FALLA"} ${nombre}`, detalle)
  }

  const e0 = await estado()
  console.log(`Cobro de prueba ${referencia} por CLP ${monto} → ${url}`)

  const s1 = await enviar({ ...base, x_signature: "0".repeat(64) }, false)
  const e1 = await estado()
  check("firma inválida → 400 y sin cambios", s1 === 400 && e1.venc === e0.venc && e1.pagos === e0.pagos, { status: s1 })

  const s2 = await enviar({ ...base, x_amount: "100" })
  const e2 = await estado()
  check("monto alterado → 200 y no renueva", s2 === 200 && e2.venc === e0.venc && e2.cobro === "PENDIENTE", { status: s2 })

  const s3 = await enviar(base)
  const e3 = await estado()
  check("pago válido → 200 y renueva", s3 === 200 && e3.cobro === "PAGADO" && e3.pagos === e0.pagos + 1 && e3.venc > e0.venc, { status: s3, antes: e0.venc, ahora: e3.venc })

  const s4 = await enviar(base)
  const e4 = await estado()
  check("callback duplicado → 200 y no renueva de nuevo", s4 === 200 && e4.venc === e3.venc && e4.pagos === e3.pagos, { status: s4 })

  console.log(fallas === 0 ? "\nTodas las pruebas pasaron." : `\n${fallas} prueba(s) fallaron: revisa pm2 logs | grep tuu-licencia`)
  process.exit(fallas === 0 ? 0 : 1)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
