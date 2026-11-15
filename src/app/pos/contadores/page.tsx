import type { Metadata } from "next"
import { BarChart3, ChefHat, ClipboardCheck, Receipt, Wallet } from "lucide-react"
import ContadorForm from "./ContadorForm"

export const metadata: Metadata = {
  title: "Programa para contadores — Hypnos POS",
  description: "Recomienda Hypnos POS a tus clientes pyme: ventas, boletas y gastos ordenados al día. Te contamos las condiciones para partners en una llamada.",
}
export const dynamic = "force-dynamic"

const NARANJA = "#f26522"

const RAZONES = [
  { I: BarChart3, t: "Ventas al día", d: "Cada venta queda registrada con su fecha, medio de pago y caja. Al cierre del mes, el resumen ya está hecho." },
  { I: Receipt, t: "Boletas ordenadas", d: "Las ventas con tarjeta salen de la máquina conectada a la caja: menos diferencias entre lo vendido y lo declarado." },
  { I: Wallet, t: "Gastos en un solo lugar", d: "Tu cliente registra sus compras y gastos desde el sistema, en vez de juntar papeles en una caja." },
  { I: ClipboardCheck, t: "Menos tiempo persiguiendo datos", d: "Recibes la información ordenada y a tiempo, sin pedirle planillas a cada cliente." },
]

// Programa para contadores (/pos/contadores): se guarda en PosPartnerLead y se gestiona en
// /admin/pos/contratar. No se publican comisiones ni montos: las condiciones se explican en una llamada.
export default async function ContadoresPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  return (
    <div className="min-h-screen bg-[#fff7f2]">
      <header className="bg-gray-950 text-white">
        <div className="max-w-5xl mx-auto px-5 pt-6 pb-24">
          <a href="/pos/contratar" className="flex items-center gap-2.5 w-fit">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: NARANJA }}><ChefHat size={20} /></span>
            <span className="font-bold tracking-tight text-lg">Hypnos <span style={{ color: NARANJA }}>POS</span></span>
          </a>
          <p className="mt-7 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide">Programa para contadores</p>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold leading-tight max-w-2xl">Clientes con sus ventas, boletas y gastos ordenados al día</h1>
          <p className="mt-3 text-gray-300 max-w-xl text-[15px]">
            Recomienda Hypnos POS a tus clientes pyme (restaurantes, almacenes y botillerías) y recibe su información ordenada, sin perseguir planillas.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 -mt-16 pb-16 grid lg:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start">
        <section className="bg-white rounded-3xl shadow-xl shadow-orange-900/5 border border-orange-100 p-5 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">¿Por qué recomendar Hypnos POS?</h2>
          <div className="mt-5 grid sm:grid-cols-2 gap-4">
            {RAZONES.map(({ I, t, d }) => (
              <div key={t} className="rounded-2xl bg-[#fff7f2] p-4">
                <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-orange-100" style={{ color: NARANJA }}><I size={20} /></span>
                <h3 className="mt-3 font-bold text-gray-900">{t}</h3>
                <p className="mt-1 text-sm text-gray-600">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-gray-100 p-4 text-sm text-gray-600 space-y-2">
            <p><strong className="text-gray-900">Para tu cliente:</strong> caja, mesas o caja rápida con lector de códigos, inventario, tienda online y soporte por WhatsApp. Funciona con su máquina TUU o Mercado Pago, sin cambiarla.</p>
            <p><strong className="text-gray-900">Para ti:</strong> las condiciones para partners te las contamos en una llamada.</p>
          </div>
        </section>
        <ContadorForm origen={(sp.o ?? "").slice(0, 40)} />
      </main>
    </div>
  )
}
