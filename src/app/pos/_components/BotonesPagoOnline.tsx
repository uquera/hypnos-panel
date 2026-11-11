import { CreditCard } from "lucide-react"

// Botones "Pagar con tarjeta o Webpay" (pago en línea TUU con renovación automática).
// Formularios HTML simples: POST /api/pos-pago/iniciar → 303 a TUU. El monto lo calcula el servidor;
// aquí solo se elige el plan (meses). Con c/t es el link de pago sin sesión (correo o WhatsApp).
export interface PlanBoton { meses: number; montoTxt: string; ahorroTxt: string | null }

export default function BotonesPagoOnline({ planes, c, t }: { planes: PlanBoton[]; c?: string; t?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {planes.map(p => (
        <form key={p.meses} method="post" action="/api/pos-pago/iniciar">
          <input type="hidden" name="meses" value={p.meses} />
          {c && t && <><input type="hidden" name="c" value={c} /><input type="hidden" name="t" value={t} /></>}
          <button type="submit"
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-left ${p.meses === 1 ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border-2 border-indigo-600 bg-white text-indigo-700 hover:bg-indigo-50"}`}>
            <CreditCard size={16} className="shrink-0" />
            <span>
              {p.meses === 1 ? `Pagar el mes · ${p.montoTxt}` : p.meses === 12 ? `Pagar el año · ${p.montoTxt}` : `Pagar ${p.meses} meses · ${p.montoTxt}`}
              {p.ahorroTxt && <span className="block text-xs font-medium opacity-80">Ahorras {p.ahorroTxt}</span>}
            </span>
          </button>
        </form>
      ))}
    </div>
  )
}

export function planesBoton(precio: number, planes: { meses: number; monto: number }[], fmt: (n: number) => string): PlanBoton[] {
  return planes.map(p => ({
    meses: p.meses, montoTxt: fmt(p.monto),
    ahorroTxt: p.monto < precio * p.meses ? fmt(precio * p.meses - p.monto) : null,
  }))
}
