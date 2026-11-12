import { MEDIO_LABEL, variacion, type Consolidado, type LocalCadena } from "@/lib/pos/cadena"
import type { Hoja } from "@/lib/pos/xlsx"

// Hojas del Excel de "Mi cadena": resumen por local, canales, medios de pago, productos y ventas por día.

export function hojasCadena(locales: LocalCadena[], total: Consolidado, periodo: string): Hoja[] {
  const ok = locales.filter((l) => l.resumen)
  const nombres = ok.map((l) => l.nombre)

  const resumen: Hoja = {
    nombre: "Resumen",
    filas: [
      ["Local", "Ventas", "Pedidos", "Ticket promedio", "Propinas", "Ventas período anterior", "Variación %", "Gastos", "Caja", "Estado"],
      ...locales.map((l) => {
        const r = l.resumen
        if (!r) return [l.nombre, null, null, null, null, null, null, null, null, l.error ?? "Sin datos"]
        return [l.nombre, r.ventas, r.pedidos, r.ticketPromedio, r.propinas, r.anterior.ventas, variacion(r.ventas, r.anterior.ventas), r.gastos,
          r.cajasAbiertas.length ? `Abierta (${r.cajasAbiertas.map((c) => c.caja).join(", ")})` : "Cerrada", "OK"]
      }),
      ["TOTAL CADENA", total.ventas, total.pedidos, total.ticketPromedio, total.propinas, total.anterior.ventas, variacion(total.ventas, total.anterior.ventas), total.gastos, null, null],
      [],
      [`Período: ${periodo}`],
    ],
  }

  const canales = Object.keys(total.porCanal).sort((a, b) => total.porCanal[b].monto - total.porCanal[a].monto)
  const porCanal: Hoja = {
    nombre: "Por canal",
    filas: [
      ["Canal", ...nombres, "Total", "Pedidos"],
      ...canales.map((c) => [c, ...ok.map((l) => l.resumen!.porCanal[c]?.monto ?? 0), total.porCanal[c].monto, total.porCanal[c].pedidos]),
    ],
  }

  const medios = Object.keys(total.porMedio).sort((a, b) => total.porMedio[b] - total.porMedio[a])
  const porMedio: Hoja = {
    nombre: "Medios de pago",
    filas: [
      ["Medio de pago", ...nombres, "Total"],
      ...medios.map((m) => [MEDIO_LABEL[m] ?? m, ...ok.map((l) => Math.round(l.resumen!.porMedio[m] ?? 0)), Math.round(total.porMedio[m])]),
    ],
  }

  const productos: Hoja = {
    nombre: "Productos",
    filas: [["Producto", "Cantidad", "Monto"], ...total.topProductos.map((p) => [p.nombre, p.cantidad, Math.round(p.monto)])],
  }

  const dias = Object.keys(total.porDia).sort()
  const porDia: Hoja = {
    nombre: "Por día",
    filas: [["Día", ...nombres, "Total"], ...dias.map((d) => [d, ...ok.map((l) => Math.round(l.resumen!.porDia[d] ?? 0)), Math.round(total.porDia[d])])],
  }

  return [resumen, porCanal, porMedio, productos, porDia]
}
