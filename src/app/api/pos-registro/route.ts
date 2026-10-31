import { NextResponse } from "next/server"
import { jsonError, manejar, mismoOrigen } from "@/lib/pos/api"
import { basePublica, excedeLimite, ipDe } from "@/lib/pos/servidor"
import { crearRestaurante, leerDatosRestaurante, tokenEstado } from "@/lib/pos/registro"
import { avisoHypnosRegistro } from "@/lib/pos/correos"
import { errorCodigoDisponible } from "@/lib/pos/alta"
import { ErrorPos } from "@/lib/pos/usuarios"
import { leerOnboarding } from "@/lib/pos/onboarding"

// POST /api/pos-registro — registro público con prueba gratis (formulario /pos/registro, multipart).
// Campos: nombre, dueno, email, whatsapp, codigo, terminos="true", y opcionales menuUrl, mesas,
// direccion, horario, logo (imagen ≤ 5 MB) y clientes (xlsx/csv ≤ 10 MB).
// Protección: mismo origen, honeypot "website", 3 registros/hora por IP y 30/hora en total,
// un correo = una cuenta (y una prueba activa).
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return jsonError("Origen no permitido.", 403)
  return manejar(async () => {
    // multipart: datos del local + logo y Excel de clientes opcionales
    const fd = await req.formData().catch(() => null)
    if (!fd) throw new ErrorPos("Formato no válido.")
    // Honeypot: los bots rellenan el campo oculto; respondemos ok sin crear nada
    if (String(fd.get("website") ?? "").trim()) return NextResponse.json({ ok: true, id: "", token: "" })
    if (fd.get("terminos") !== "true") throw new ErrorPos("Debes aceptar los términos para continuar.")

    const datos = leerDatosRestaurante(fd)
    const errCodigo = await errorCodigoDisponible(datos.codigo)
    if (errCodigo) throw new ErrorPos(errCodigo, 409)

    // Se valida todo (archivos y link del menú) antes de contar el intento en el límite por IP
    const onboarding = await leerOnboarding(fd)

    const ip = ipDe(req)
    if (excedeLimite(`pos-registro:${ip || "sin-ip"}`, 3, 60 * 60_000) || excedeLimite("pos-registro:global", 30, 60 * 60_000)) {
      return jsonError("Recibimos demasiados registros desde tu conexión. Intenta en una hora o escríbenos por WhatsApp.", 429)
    }

    const id = await crearRestaurante(datos, { enPrueba: true, origen: "REGISTRO", ip, onboarding })
    await avisoHypnosRegistro({
      restaurante: datos.nombre, dueno: datos.dueno, email: datos.email, whatsapp: datos.whatsapp, codigo: datos.codigo,
      linkFicha: `${basePublica(req)}/admin/pos/${id}`,
    }).catch(e => console.error("[pos-registro] aviso a Hypnos:", e))

    return NextResponse.json({ ok: true, id, token: tokenEstado(id) }, { status: 201 })
  })
}
