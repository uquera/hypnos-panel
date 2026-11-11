import type { Metadata } from "next"
import { ScanBarcode, Wallet, PackageSearch, NotebookPen, BarChart3, Scale, Truck, CreditCard, Check, MessageCircle, Play } from "lucide-react"
import { precioMensual, diasPrueba, formatoCLP } from "@/lib/pos/config"
import AlmacenForm from "./AlmacenForm"

export const metadata: Metadata = {
  title: "Sistema de caja para almacenes y minimarkets — Hypnos POS",
  description: "Escanea con el celular, cobra con vuelto, controla el stock y los fiados. Pruébalo gratis 7 días, sin tarjeta.",
  openGraph: {
    title: "La caja de tu almacén, en tu celular",
    description: "Escanea, cobra y sabe cuánto vendiste hoy. Stock, fiados y reportes. Prueba gratis.",
    type: "website", locale: "es_CL", siteName: "Hypnos POS",
  },
}
export const dynamic = "force-dynamic"

const WA = "https://wa.me/56933688302?text=" + encodeURIComponent("Hola, tengo un almacén y quiero conocer el sistema de caja de Hypnos")
const DEMO = "https://demo-almacen.hypnosapps.com"
const PUESTA_EN_MARCHA = 100_000

const DOLORES = [
  { icon: Wallet, titulo: "¿Cuánto vendiste hoy?", texto: "Cada venta queda registrada con su hora, su medio de pago y quién la hizo. Al cerrar la caja, el sistema te dice si cuadra." },
  { icon: PackageSearch, titulo: "¿Qué se te está acabando?", texto: "El stock baja solo con cada venta. Una lista te muestra qué reponer y cuánto comprar, antes de que falte." },
  { icon: NotebookPen, titulo: "¿Quién te debe?", texto: "Los fiados quedan anotados por cliente, con su saldo y sus abonos. Se acabó el cuaderno." },
]

const FUNCIONES = [
  { icon: ScanBarcode, titulo: "Escanea con el celular o con lector", texto: "La cámara del teléfono lee el código de barras. En un computador, cualquier lector USB funciona al enchufarlo." },
  { icon: Wallet, titulo: "Cobro con vuelto", texto: "Escribe con cuánto paga el cliente y la pantalla muestra el vuelto. Efectivo, tarjeta, transferencia o fiado." },
  { icon: Scale, titulo: "Venta por peso", texto: "Pan, fiambre, fruta y verdura: escribe los gramos o el monto («mil pesos de pan») y el sistema calcula." },
  { icon: Truck, titulo: "Recibir mercancía", texto: "Escanea lo que llega del proveedor, pon cantidad y costo, y el stock sube. La compra queda registrada." },
  { icon: BarChart3, titulo: "Ventas y ganancia", texto: "Cuánto vendiste, qué productos se mueven más y cuánto ganaste, por día o por mes." },
  { icon: CreditCard, titulo: "Máquina de tarjetas", texto: "Se conecta con la máquina TUU: el monto llega solo a la máquina y la venta se registra al aprobarse." },
]

const PASOS = [
  { n: "1", titulo: "Crea tu prueba", texto: "Llena cuatro datos. En un par de minutos tu sistema está listo, con productos de ejemplo para practicar." },
  { n: "2", titulo: "Haz tu primera venta", texto: "Abre la caja, escanea un producto y cobra. Así de corto es el aprendizaje para quien atiende." },
  { n: "3", titulo: "Carga tus productos", texto: "Escaneándolos, con un Excel, o los cargamos nosotros con la puesta en marcha asistida." },
]

const PREGUNTAS = [
  ["¿Necesito un computador?", "No. Funciona en el celular con la cámara como lector. Si después quieres una caja fija, sirve cualquier computador con un lector de códigos de barras USB."],
  ["¿Y la boleta?", "La boleta la entrega tu máquina de tarjetas, como hoy. El sistema registra la venta, descuenta el stock y te deja el recibo si tienes impresora."],
  ["¿Cuánto me demoro en cargar mis productos?", "Depende de cuántos tengas. Puedes partir con los que más vendes y sumar el resto al recibir mercancía. Si prefieres no hacerlo tú, lo hacemos nosotros con la puesta en marcha asistida."],
  ["¿Qué pasa cuando termina la prueba?", "Te avisamos antes. Si quieres seguir, pagas el plan mensual; si no, no se te cobra nada. No pedimos tarjeta para probar."],
  ["¿Puedo tener más de una caja?", "Sí. El plan se paga por caja activa: un local con dos cajas paga dos planes."],
  ["¿Mis datos están seguros?", "Tu sistema corre en un servidor con respaldo diario. Cada persona entra con su usuario, y tú decides qué puede ver la cajera."],
]

/** Teléfono de muestra con una venta en curso (dibujado con HTML: se ve nítido en cualquier pantalla). */
function Telefono() {
  const lineas = [["Bebida cola 1,5 L", "2", "$4.380"], ["Pan marraqueta · 0,350 kg", "", "$770"], ["Leche entera 1 L", "3", "$3.570"]]
  return (
    <div className="mx-auto w-[270px] rounded-[2.2rem] border-[10px] border-stone-900 bg-[#f7f5f2] shadow-2xl" aria-hidden>
      <div className="rounded-t-[1.4rem] bg-[#ffffff] px-3 pb-2 pt-4">
        <div className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-[11px] text-stone-400">
          <ScanBarcode size={14} /> Buscar producto
          <span className="ml-auto rounded-lg bg-stone-900 px-2 py-1 text-[10px] font-semibold text-white">Cámara</span>
        </div>
      </div>
      <div className="space-y-1.5 px-3 py-2">
        {lineas.map(([nombre, cantidad, total]) => (
          <div key={nombre} className="flex items-center justify-between rounded-xl bg-[#ffffff] px-3 py-2 shadow-sm">
            <span className="text-[11px] font-semibold text-stone-800">{nombre}</span>
            <span className="flex items-center gap-2">
              {cantidad && <span className="rounded-md border border-stone-200 px-1.5 text-[10px] font-bold text-stone-700">{cantidad}</span>}
              <span className="text-[11px] font-bold text-stone-900">{total}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-b-[1.4rem] bg-[#ffffff] px-3 pb-4 pt-2">
        <div className="flex items-end justify-between">
          <span className="text-[10px] font-semibold uppercase text-stone-400">Total</span>
          <span className="text-2xl font-extrabold text-stone-900">$8.720</span>
        </div>
        <div className="mt-2 rounded-xl bg-emerald-600 py-2.5 text-center text-sm font-bold text-white">Cobrar</div>
        <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2">
          <span className="text-[11px] font-semibold text-emerald-800">Paga con $10.000 · Vuelto</span>
          <span className="text-base font-extrabold text-emerald-800">$1.280</span>
        </div>
      </div>
    </div>
  )
}

export default function AlmacenesPage() {
  const precio = formatoCLP(precioMensual())
  const dias = diasPrueba()
  const cta = "inline-flex h-12 items-center justify-center rounded-xl bg-[#f26522] px-6 text-base font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-[#d9551a]"
  return (
    <div className="min-h-screen bg-[#fffaf5] text-stone-900">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <span className="text-lg font-extrabold tracking-tight">Hypnos <span className="text-[#f26522]">POS</span> <span className="ml-1 rounded-full bg-stone-900 px-2 py-0.5 text-[11px] font-semibold text-white">Almacenes</span></span>
        <a href={WA} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-[#ffffff] px-3 py-2 text-sm font-semibold text-stone-800"><MessageCircle size={16} className="text-emerald-600" /> WhatsApp</a>
      </header>

      {/* ── Portada ── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-6 md:grid-cols-2 md:pt-12">
        <div>
          <p className="mb-3 inline-block rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#c2410c]">Para almacenes, minimarkets y botillerías</p>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">La caja de tu almacén, <span className="text-[#f26522]">en tu celular</span></h1>
          <p className="mt-4 max-w-lg text-lg text-stone-600">Escanea, cobra y sabe cuánto vendiste hoy. Controla el stock y los fiados sin cuadernos ni planillas.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#probar" className={cta}>Probar gratis {dias} días</a>
            <a href={DEMO} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-[#ffffff] px-5 text-base font-semibold text-stone-800"><Play size={18} className="text-[#f26522]" /> Ver la demo ahora</a>
          </div>
          <p className="mt-2 text-sm text-stone-500">La demo se abre al tiro, sin registrarte: un almacén de ejemplo para vender, recibir mercadería y anotar fiados.</p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
            {["Sin tarjeta", "Listo en 2 minutos", "Funciona en el celular que ya tienes"].map(t => <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-emerald-600" /> {t}</li>)}
          </ul>
        </div>
        <Telefono />
      </section>

      {/* ── Lo que resuelve ── */}
      <section className="bg-[#ffffff] py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Tres preguntas que hoy no puedes responder</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {DOLORES.map(({ icon: Icon, titulo, texto }) => (
              <div key={titulo} className="rounded-2xl border border-stone-200 bg-[#fffaf5] p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-[#f26522]"><Icon size={22} /></span>
                <h3 className="mt-4 text-xl font-bold">{titulo}</h3>
                <p className="mt-2 text-stone-600">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo se parte ── */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Partes hoy mismo</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PASOS.map(p => (
            <div key={p.n} className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">{p.n}</span>
              <h3 className="mt-3 text-lg font-bold">{p.titulo}</h3>
              <p className="mt-1 text-stone-600">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Funciones ── */}
      <section className="bg-[#ffffff] py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Hecho para quien atiende la caja</h2>
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {FUNCIONES.map(({ icon: Icon, titulo, texto }) => (
              <div key={titulo} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-800"><Icon size={20} /></span>
                <div><h3 className="font-bold">{titulo}</h3><p className="mt-0.5 text-sm text-stone-600">{texto}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Precio ── */}
      <section className="mx-auto max-w-4xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Un precio simple</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border-2 border-[#f26522] bg-[#ffffff] p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-[#c2410c]">Plan mensual</p>
            <p className="mt-2 text-4xl font-extrabold">{precio}<span className="text-base font-semibold text-stone-500"> al mes por caja</span></p>
            <ul className="mt-4 space-y-2 text-stone-700">
              {[`${dias} días de prueba gratis, sin tarjeta`, "Productos, ventas y usuarios sin límite", "Todas las funciones incluidas", "Soporte por WhatsApp", "Un local con dos cajas paga dos planes"].map(t => <li key={t} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-emerald-600" /> {t}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-[#ffffff] p-6">
            <p className="text-sm font-bold uppercase tracking-wide text-stone-500">Puesta en marcha asistida · opcional</p>
            <p className="mt-2 text-4xl font-extrabold">{formatoCLP(PUESTA_EN_MARCHA)}<span className="text-base font-semibold text-stone-500"> una sola vez</span></p>
            <ul className="mt-4 space-y-2 text-stone-700">
              {["Cargamos tus productos con código, precio y stock", "Dejamos lista la caja, los usuarios y la impresora", "Capacitamos a quien atiende"].map(t => <li key={t} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-emerald-600" /> {t}</li>)}
            </ul>
            <p className="mt-4 rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-700">Si cargas tus productos por tu cuenta, no tiene costo: solo pagas el plan mensual.</p>
          </div>
        </div>
      </section>

      {/* ── Registro ── */}
      <section id="probar" className="scroll-mt-4 bg-stone-900 py-14">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 md:grid-cols-[1fr_minmax(0,440px)]">
          <div className="text-white">
            <h2 className="text-3xl font-extrabold tracking-tight">Crea tu prueba gratis</h2>
            <p className="mt-3 text-stone-300">En un par de minutos tienes tu propio sistema, con productos de ejemplo, para vender desde el celular.</p>
            <ul className="mt-5 space-y-2 text-stone-200">
              {[`${dias} días gratis, sin tarjeta`, "Tu sistema queda en tu propia dirección web", "Si no te sirve, no pagas nada"].map(t => <li key={t} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-emerald-400" /> {t}</li>)}
            </ul>
            <p className="mt-6 text-sm text-stone-300">¿Prefieres mirar primero? <a href={DEMO} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline">Abre la demo sin registrarte</a>.</p>
          </div>
          <AlmacenForm dias={dias} precio={precio} />
        </div>
      </section>

      {/* ── Preguntas ── */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Preguntas frecuentes</h2>
        <div className="mt-6 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-[#ffffff]">
          {PREGUNTAS.map(([p, r]) => (
            <details key={p} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">{p}</summary>
              <p className="mt-2 text-stone-600">{r}</p>
            </details>
          ))}
        </div>
        <div className="mt-8 text-center"><a href="#probar" className={cta}>Probar gratis {dias} días</a></div>
      </section>

      <footer className="border-t border-stone-200 py-6 text-center text-sm text-stone-500">
        Hypnos · Iquique, Chile · <a className="underline" href={WA} target="_blank" rel="noopener noreferrer">+56 9 3368 8302</a> · contacto@hypnosapps.com
      </footer>
    </div>
  )
}
