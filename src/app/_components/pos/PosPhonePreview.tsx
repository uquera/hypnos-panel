"use client"

import { useState } from "react"
import type { ColoresPos } from "@/lib/pos/validacion"

// Vista previa de la app Hypnos POS en la máquina TUU Pro 2 (pantalla de teléfono):
// "Inicio" = lo que se ve al abrir la app; "Caja" = el sistema web del negocio dentro de la app.

interface Props {
  nombre:  string
  logoUrl: string | null
  colores: ColoresPos
  posUrl?: string
}

export default function PosPhonePreview({ nombre, logoUrl, colores, posUrl }: Props) {
  const [pantalla, setPantalla] = useState<"inicio" | "caja">("inicio")
  const { colorPrimario: primario, colorTextoPrimario: sobrePrimario, colorFondo: fondo, colorTexto: texto } = colores
  const nombreVisible = nombre.trim() || "Tu negocio"
  let host = ""
  try { host = posUrl ? new URL(posUrl).host : "" } catch { /* link a medio escribir */ }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="inline-flex p-1 rounded-xl bg-gray-100 text-xs font-semibold">
        {(["inicio", "caja"] as const).map(p => (
          <button key={p} type="button" onClick={() => setPantalla(p)}
            className={["px-3 py-1.5 rounded-lg transition-colors",
              pantalla === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"].join(" ")}>
            {p === "inicio" ? "Inicio" : "Caja"}
          </button>
        ))}
      </div>

      {/* Marco del equipo */}
      <div className="w-[236px] rounded-[2.2rem] bg-gray-900 p-2.5 shadow-xl ring-1 ring-black/10">
        <div className="relative h-[452px] rounded-[1.7rem] overflow-hidden flex flex-col" style={{ background: fondo, color: texto }}>
          {/* Barra de estado */}
          <div className="h-6 shrink-0 flex items-center justify-between px-4 text-[10px] font-semibold"
               style={{ background: primario, color: sobrePrimario }}>
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm border border-current" />
              <span>100%</span>
            </span>
          </div>

          {pantalla === "inicio" ? (
            <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="w-28 h-28 object-contain" />
              ) : (
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-bold"
                     style={{ background: primario, color: sobrePrimario }}>
                  {nombreVisible.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="mt-4 text-lg font-bold leading-tight break-words max-w-full">{nombreVisible}</p>
              <p className="mt-1 text-[11px] opacity-70">Caja y cobro con tarjeta</p>
              <div className="mt-6 w-full h-11 rounded-xl flex items-center justify-center text-sm font-semibold shadow-sm"
                   style={{ background: primario, color: sobrePrimario }}>
                Abrir caja
              </div>
              <p className="mt-auto pt-6 pb-1 text-[9px] opacity-50">Hypnos POS</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="h-11 shrink-0 flex items-center gap-2 px-3" style={{ background: primario, color: sobrePrimario }}>
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="w-7 h-7 rounded-md object-contain bg-white/90 p-0.5" />
                ) : null}
                <span className="text-sm font-semibold truncate">{nombreVisible}</span>
              </div>
              <div className="flex-1 p-3 space-y-2 overflow-hidden">
                <p className="text-[9px] opacity-50 truncate">{host || "sistema web del negocio"}</p>
                {["Menú del día", "Bebida", "Café"].map((item, i) => (
                  <div key={item} className="flex items-center justify-between text-[11px] py-1.5 border-b"
                       style={{ borderColor: texto + "22" }}>
                    <span>{item}</span>
                    <span className="font-semibold">${[8990, 2500, 1500][i].toLocaleString("es-CL")}</span>
                  </div>
                ))}
              </div>
              <div className="p-3">
                <div className="h-11 rounded-xl flex items-center justify-center text-sm font-semibold"
                     style={{ background: primario, color: sobrePrimario }}>
                  Cobrar $12.990
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 text-center max-w-[240px]">
        Vista aproximada de la app en la máquina de pago. Los cambios llegan al abrir la app.
      </p>
    </div>
  )
}
