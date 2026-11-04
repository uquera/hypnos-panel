import Link from "next/link"
import { redirect } from "next/navigation"
import { AlertTriangle, ArrowRight, ChefHat, CreditCard, ExternalLink, Loader2, Palette, Printer, Users, UtensilsCrossed } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireSesionPos } from "@/lib/pos/sesion"
import { estadoPos } from "@/lib/pos/cobro"
import { fechaLarga } from "@/lib/pos/fechas"
import { conAcceso } from "@/lib/pos/acceso"
import CopiarLink from "./CopiarLink"

export const metadata = { title: "Inicio — Hypnos POS" }
export const dynamic = "force-dynamic"

const NARANJA = "#f26522"

// Primeros pasos dentro del sistema (cada uno abre esa pantalla con la sesión ya iniciada)
const PASOS = [
  { ir: "/menu", icono: UtensilsCrossed, titulo: "Revisa tu carta", detalle: "Productos, precios y categorías. Si importamos tu menú, ya está ahí." },
  { ir: "/configuracion/impresoras", icono: Printer, titulo: "Conecta tu impresora", detalle: "Comandas para cocina y boletas para tus clientes." },
  { ir: "/configuracion", icono: Users, titulo: "Invita a tu equipo", detalle: "Garzones y cajeros con su propio usuario, en Usuarios." },
  { ir: "/restaurante", icono: ChefHat, titulo: "Haz tu primera venta", detalle: "Abre una mesa, envía la comanda a cocina y cobra." },
]

// Portada del portal: el botón para entrar al sistema del restaurante, el estado del plan y
// los primeros pasos. Es a donde llega el dueño al crear su contraseña o al ingresar.
export default async function PosInicioPage() {
  const yo = await requireSesionPos("/pos/inicio")
  const cuenta = await prisma.posCuenta.findUnique({
    where: { id: yo.cuentaId },
    include: { cliente: { select: { masterKey: true, fechaVencimiento: true, suspendida: true } } },
  })
  if (!cuenta) redirect("/pos/login")

  const esDueno = yo.rol === "DUENO"
  const listo = cuenta.estadoAlta === "LISTO" || cuenta.estadoAlta === "MANUAL"
  const sso = conAcceso(cuenta)
  const { estado, dias } = estadoPos(cuenta)
  const vence = cuenta.cliente?.fechaVencimiento ?? null
  const linkSistema = cuenta.posUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  const abrir = (ir?: string) => `/api/pos-portal/abrir${ir ? `?ir=${encodeURIComponent(ir)}` : ""}`

  let plan: { texto: string; tono: string } | null = null
  if (vence) {
    if (estado === "EN_PRUEBA") plan = { texto: `Prueba gratis: ${dias === 0 ? "termina hoy" : `te quedan ${dias} día${dias === 1 ? "" : "s"}`} (hasta el ${fechaLarga(vence)})`, tono: "bg-amber-50 border-amber-100 text-amber-800" }
    else if (estado === "SUSPENDIDO") plan = { texto: "Tu sistema está suspendido. Paga tu plan para reactivarlo.", tono: "bg-red-50 border-red-100 text-red-700" }
    else if (estado === "VENCIDO") plan = { texto: `Tu plan venció el ${fechaLarga(vence)}. Paga pronto para no perder el acceso.`, tono: "bg-red-50 border-red-100 text-red-700" }
    else if (estado === "POR_VENCER") plan = { texto: `Tu plan vence ${dias === 0 ? "hoy" : `en ${dias} día${dias === 1 ? "" : "s"}`}.`, tono: "bg-amber-50 border-amber-100 text-amber-800" }
    else if (estado === "AL_DIA") plan = { texto: `Plan al día hasta el ${fechaLarga(vence)}.`, tono: "bg-green-50 border-green-100 text-green-800" }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Entrada al sistema */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
        <p className="text-sm text-gray-500">Hola, {yo.nombre.split(" ")[0]} 👋</p>
        <h1 className="mt-1 text-xl lg:text-2xl font-bold text-gray-900">
          {listo ? `${cuenta.nombre} ya está funcionando` : `Estamos preparando ${cuenta.nombre}`}
        </h1>

        {listo ? (
          <>
            <p className="mt-1.5 text-sm text-gray-500">
              {sso
                ? "Entra con un toque: tu sesión se abre sola. Desde otro equipo entras con tu correo y la misma contraseña de este portal."
                : "Entra a tu sistema con tu correo y contraseña."}
            </p>
            <a href={abrir()} target="_blank" rel="noopener"
              className="mt-5 w-full h-14 rounded-xl text-white text-base font-bold inline-flex items-center justify-center gap-2 shadow-sm hover:opacity-95 transition"
              style={{ background: NARANJA }}>
              Abrir mi sistema <ExternalLink size={18} />
            </a>
            <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-3.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Link de tu sistema</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate font-mono text-sm font-semibold text-gray-900">{linkSistema}</span>
                <CopiarLink url={cuenta.posUrl} />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Guárdalo en tus favoritos y compártelo con tu equipo: cada uno entra con su propio usuario.</p>
            </div>
          </>
        ) : cuenta.estadoAlta === "ERROR" ? (
          <p className="mt-3 flex gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            Tuvimos un problema instalando tu sistema y nuestro equipo ya lo está revisando. Te avisaremos por correo, o escríbenos al <a className="underline font-semibold" href="https://wa.me/56933688302">WhatsApp</a>.
          </p>
        ) : (
          <p className="mt-3 flex gap-2 text-sm text-gray-600">
            <Loader2 size={16} className="shrink-0 mt-0.5 animate-spin" /> Suele tardar 1 a 3 minutos. Recarga esta página en un rato; también te avisaremos por correo.
          </p>
        )}

        {plan && (
          <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${plan.tono}`}>
            <span>{plan.texto}</span>
            {esDueno && (
              <Link href="/pos/pago" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                <CreditCard size={14} /> Ver mi plan
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Primeros pasos */}
      {listo && (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <h2 className="font-bold text-gray-900">Primeros pasos</h2>
          <p className="text-sm text-gray-500 mt-0.5">Cada paso abre la pantalla correcta de tu sistema.</p>
          <ol className="mt-4 space-y-2">
            {PASOS.map((p, i) => (
              <li key={p.ir}>
                <a href={abrir(p.ir)} target="_blank" rel="noopener"
                  className="group flex items-center gap-3 rounded-xl border border-gray-100 p-3 hover:border-orange-200 hover:bg-orange-50/40 transition">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-sm font-bold" style={{ background: NARANJA }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><p.icono size={15} className="text-gray-400" /> {p.titulo}</span>
                    <span className="block text-xs text-gray-500">{p.detalle}</span>
                  </span>
                  <ArrowRight size={16} className="text-gray-300 group-hover:text-orange-500 shrink-0" />
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-gray-500">
            Dentro del sistema tienes la burbuja <strong>«¿Cómo se hace?»</strong> para cualquier duda, y nuestro <a className="underline" href="https://wa.me/56933688302">WhatsApp +56 9 3368 8302</a>.
          </p>
        </section>
      )}

      {/* Marca de la app en la máquina de pago (opcional) */}
      <Link href="/pos/marca" className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-gray-200 transition">
        <span className="w-9 h-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0"><Palette size={17} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900">Marca en la máquina de pago</span>
          <span className="block text-xs text-gray-500">Opcional: logo y colores de la app Hypnos POS en tu máquina TUU.</span>
        </span>
        <ArrowRight size={16} className="text-gray-300 shrink-0" />
      </Link>
    </div>
  )
}
