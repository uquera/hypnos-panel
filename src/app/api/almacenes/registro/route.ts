import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, manejar, mismoOrigen } from "@/lib/pos/api"
import { basePublica, excedeLimite, ipDe } from "@/lib/pos/servidor"
import { crearRestaurante, leerDatosRestaurante, tokenEstado } from "@/lib/pos/registro"
import { errorCodigoDisponible, sugerirCodigo } from "@/lib/pos/alta"
import { avisoHypnosRegistro } from "@/lib/pos/correos"
import { precioMensual } from "@/lib/pos/config"
import { ErrorPos } from "@/lib/pos/usuarios"

// POST /api/almacenes/registro — prueba gratis de Hypnos POS para almacenes y minimarkets
// (página /almacenes). JSON: nombre, dueno, whatsapp, email, cajas, atiende, productos, terminos.
// Sin elegir dirección: el subdominio sale del nombre del local. Crea la cuenta (tipo ALMACEN),
// instala su sistema con productos de ejemplo y deja el contacto en Leads con su segmento.
// Protección: mismo origen, honeypot "website", 3 registros/hora por IP y 30/hora en total.

const ATIENDE: Record<string, string> = { yo: "Atiende el dueño", empleados: "Atienden empleados", ambos: "Atienden dueño y empleados" }
const PRODUCTOS: Record<string, string> = { pocos: "Menos de 500 productos", medio: "500 a 2.000 productos", muchos: "Más de 2.000 productos" }

/** Segmento comercial: C = dos o más cajas, A = atienden empleados, B = dueño solo. */
function segmento(cajas: number, atiende: string): "A" | "B" | "C" {
  if (cajas >= 2) return "C"
  return atiende === "empleados" || atiende === "ambos" ? "A" : "B"
}

/** Subdominio libre a partir del nombre ("Mini Market Don Luis" → mini-market-don-luis, -2, -3…). */
async function codigoLibre(nombre: string): Promise<string> {
  const base = (sugerirCodigo(nombre) || "almacen").slice(0, 24).replace(/-+$/, "")
  const raiz = base.length >= 3 ? base : `almacen-${base}`.replace(/-+$/, "")
  for (let i = 1; i <= 30; i++) {
    const c = i === 1 ? raiz : `${raiz}-${i}`
    if (!(await errorCodigoDisponible(c))) return c
  }
  throw new ErrorPos("No pudimos reservar una dirección para tu sistema. Escríbenos por WhatsApp y lo creamos contigo.", 409)
}

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  return manejar(async () => {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) throw new ErrorPos("Formato no válido.")
    // Honeypot: los bots rellenan el campo oculto; respondemos ok sin crear nada
    if (String(body.website ?? "").trim()) return NextResponse.json({ ok: true, id: "", token: "" })
    if (body.terminos !== true) throw new ErrorPos("Debes aceptar los términos para continuar.")

    const nombre = String(body.nombre ?? "").trim()
    const datos = leerDatosRestaurante({ ...body, codigo: "pendiente" })
    const cajas = Math.min(Math.max(Math.round(Number(body.cajas)) || 1, 1), 10)
    const atiende = typeof body.atiende === "string" && ATIENDE[body.atiende] ? body.atiende : "yo"
    const productos = typeof body.productos === "string" && PRODUCTOS[body.productos] ? body.productos : "pocos"
    const asistida = body.asistida === true

    const ip = ipDe(req)
    if (excedeLimite(`pos-registro:${ip || "sin-ip"}`, 3, 60 * 60_000) || excedeLimite("pos-registro:global", 30, 60 * 60_000)) {
      return jsonError("Recibimos demasiados registros desde tu conexión. Intenta en una hora o escríbenos por WhatsApp.", 429)
    }

    datos.codigo = await codigoLibre(nombre)
    const id = await crearRestaurante(datos, { enPrueba: true, origen: "REGISTRO", ip, tipo: "ALMACEN", cajas })
    // el plan se cobra por caja activa
    if (cajas > 1) await prisma.posCuenta.update({ where: { id }, data: { precioMensual: precioMensual() * cajas } })

    const seg = segmento(cajas, atiende)
    await prisma.lead.create({
      data: {
        negocio: datos.nombre, tipo: `Almacén · segmento ${seg}`, nombre: datos.dueno, whatsapp: datos.whatsapp, email: datos.email,
        origen: typeof body.origen === "string" && body.origen ? `almacenes:${body.origen.slice(0, 40)}` : "almacenes",
        notas: [`${cajas} caja(s)`, ATIENDE[atiende], PRODUCTOS[productos], asistida ? "Quiere puesta en marcha asistida ($100.000)" : "Carga sus productos por su cuenta", `Sistema: ${datos.codigo}.hypnosapps.com`].join(" · "),
        ip, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300),
      },
    }).catch(e => console.error("[almacenes] lead:", e))

    await avisoHypnosRegistro({
      restaurante: `${datos.nombre} (almacén, segmento ${seg}${asistida ? ", quiere puesta en marcha" : ""})`, dueno: datos.dueno, email: datos.email, whatsapp: datos.whatsapp, codigo: datos.codigo,
      linkFicha: `${basePublica(req)}/admin/pos/${id}`,
    }).catch(e => console.error("[almacenes] aviso a Hypnos:", e))

    return NextResponse.json({ ok: true, id, token: tokenEstado(id), codigo: datos.codigo }, { status: 201 })
  })
}
