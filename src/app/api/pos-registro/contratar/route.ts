import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { jsonError, manejar, mismoOrigen } from "@/lib/pos/api"
import { basePublica, excedeLimite, ipDe } from "@/lib/pos/servidor"
import { crearRestaurante, leerDatosRestaurante, tokenEstado } from "@/lib/pos/registro"
import { errorCodigoDisponible } from "@/lib/pos/alta"
import { leerOnboarding } from "@/lib/pos/onboarding"
import { ErrorPos } from "@/lib/pos/usuarios"
import { avisoPedido, buscarCupon, crearPedido, getCatalogo, tokenPedido } from "@/lib/pos/contratar"
import { calcularPedido, normalizarRut, type Adicional, type Seleccion } from "@/lib/pos/contratar-calculo"

// POST /api/pos-registro/contratar — contratación online de Hypnos POS (página /pos/contratar, multipart).
// Campos del registro (nombre, dueno, email, whatsapp, codigo, terminos, logo, menuUrl, clientes) más:
//   tipo RESTAURANTE|ALMACEN · plan MENSUAL|ANUAL · cajas · adicionales (lista separada por comas:
//   marcha, point, tengo, fudo) · maquinas · cupon · medio MERCADOPAGO|TRANSFERENCIA ·
//   rut · razonSocial · comuna · direccionEnvio
// Crea la cuenta en prueba y lanza la instalación (como /pos/registro); si hay algo que pagar hoy crea
// el pedido y devuelve el link de Mercado Pago. Los montos se calculan aquí, nunca se leen del navegador.
// Protección: mismo origen, honeypot "website", 3 registros/hora por IP y 30/hora en total.

const ADICIONALES: Adicional[] = ["marcha", "point", "tengo", "fudo"]
const txt = (v: FormDataEntryValue | null, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max)

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  return manejar(async () => {
    const fd = await req.formData().catch(() => null)
    if (!fd) throw new ErrorPos("Formato no válido.")
    if (txt(fd.get("website"), 100)) return NextResponse.json({ ok: true, id: "", token: "" })
    if (fd.get("terminos") !== "true") throw new ErrorPos("Debes aceptar los términos para continuar.")

    const datos = leerDatosRestaurante(fd)
    const errCodigo = await errorCodigoDisponible(datos.codigo)
    if (errCodigo) throw new ErrorPos(errCodigo, 409)

    const tipo = fd.get("tipo") === "ALMACEN" ? "ALMACEN" : "RESTAURANTE"
    const plan = fd.get("plan") === "ANUAL" ? "ANUAL" : "MENSUAL"
    const cat = await getCatalogo()
    const cajas = Math.min(Math.max(Math.round(Number(fd.get("cajas"))) || 1, 1), cat.maxCajas)
    const adicionales = String(fd.get("adicionales") ?? "").split(",").map(s => s.trim()).filter((s): s is Adicional => ADICIONALES.includes(s as Adicional))
    const medio = fd.get("medio") === "TRANSFERENCIA" ? "TRANSFERENCIA" : "MERCADOPAGO"

    const rut = normalizarRut(txt(fd.get("rut"), 20))
    if (!rut) throw new ErrorPos("Revisa el RUT de la empresa: el dígito verificador no calza.")
    const razonSocial = txt(fd.get("razonSocial"), 120)
    if (razonSocial.length < 2) throw new ErrorPos("Escribe la razón social (o tu nombre si eres persona natural).")
    const comuna = txt(fd.get("comuna"), 60)
    if (comuna.length < 2) throw new ErrorPos("Escribe la comuna del local.")
    const direccionEnvio = txt(fd.get("direccionEnvio"), 200)

    const codigoCupon = txt(fd.get("cupon"), 30)
    const cupon = codigoCupon ? await buscarCupon(codigoCupon) : null

    const seleccion: Seleccion = { plan, cajas, adicionales, maquinas: Number(fd.get("maquinas")) || 1, cupon }
    const previo = calcularPedido(cat, seleccion)
    if (previo.maquinas > 0 && direccionEnvio.length < 6) throw new ErrorPos("Escribe la dirección donde te despachamos la máquina.")

    const onboarding = await leerOnboarding(fd)

    const ip = ipDe(req)
    if (excedeLimite(`pos-registro:${ip || "sin-ip"}`, 3, 60 * 60_000) || excedeLimite("pos-registro:global", 30, 60 * 60_000)) {
      return jsonError("Recibimos demasiados registros desde tu conexión. Intenta en una hora o escríbenos por WhatsApp.", 429)
    }

    const id = await crearRestaurante(datos, { enPrueba: true, origen: "REGISTRO", ip, onboarding, tipo, cajas })
    await prisma.posCuenta.update({
      where: { id },
      data: {
        planPeriodo: plan, cajas, rut, razonSocial, comuna,
        ...(direccionEnvio && !onboarding.direccion ? { direccion: direccionEnvio } : {}),
        // el plan se cobra por caja (el cron y /pos/pago usan este precio)
        precioMensual: cat.mensualCaja * cajas,
      },
    })

    // La cuenta ya existe y se está instalando: si Mercado Pago falla, el pedido queda pendiente y la
    // página final ofrece reintentar el pago (nunca se le pide registrarse de nuevo).
    const { pedidoId, pedido, pagarUrl, errorPago } = await crearPedido({
      cuentaId: id, seleccion, cuponId: cupon?.id ?? null, medio,
      facturacion: { rut, razonSocial, comuna, direccionEnvio },
      email: datos.email, dueno: datos.dueno, local: datos.nombre, origen: txt(fd.get("origen"), 40),
    })

    void avisoPedido(pedidoId, "nuevo").catch(e => console.error("[contratar] aviso a Hypnos:", e))
    console.info("[contratar] nuevo", { codigo: datos.codigo, plan, cajas, total: pedido.total, medio: pedido.total ? medio : "PRUEBA", base: basePublica(req) })

    return NextResponse.json({
      ok: true, id, token: tokenEstado(id),
      pedido: pedidoId, tokenPedido: tokenPedido(pedidoId),
      total: pedido.total, pagarUrl, errorPago,
    }, { status: 201 })
  })
}
