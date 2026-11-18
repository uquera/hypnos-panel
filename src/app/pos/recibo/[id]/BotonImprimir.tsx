"use client"

export default function BotonImprimir() {
  return (
    <button onClick={() => window.print()} className="mt-6 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 print:hidden">
      Imprimir o guardar en PDF
    </button>
  )
}
