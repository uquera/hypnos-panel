import { NextResponse } from "next/server"
import { getSesionPos } from "@/lib/pos/sesion"
import { cadenaDe, rangoFechas, resumenCadena, RANGOS, type Rango } from "@/lib/pos/cadena"
import { hojasCadena } from "@/lib/pos/cadena-excel"
import { crearXlsx } from "@/lib/pos/xlsx"

export const dynamic = "force-dynamic"

// GET /api/pos-portal/cadena/excel?rango=mes[&desde=YYYY-MM-DD&hasta=YYYY-MM-DD] — consolidado de "Mi cadena" en Excel.
export async function GET(req: Request) {
  const yo = await getSesionPos()
  if (!yo) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const cadena = await cadenaDe(yo.email)
  if (!cadena) return NextResponse.json({ error: "No tienes una cadena de locales" }, { status: 404 })

  const p = new URL(req.url).searchParams
  const rango = (RANGOS.some((r) => r.id === p.get("rango")) ? p.get("rango") : "mes") as Rango
  const f = rangoFechas(rango, p.get("desde") ?? undefined, p.get("hasta") ?? undefined)
  const { locales, total } = await resumenCadena(cadena, f.desde, f.hasta)
  const periodo = f.desdeDia === f.hastaDia ? f.desdeDia : `${f.desdeDia} al ${f.hastaDia}`
  const xlsx = crearXlsx(hojasCadena(locales, total, periodo))
  const archivo = `${cadena.nombre.replace(/[^\w-]+/g, "-").toLowerCase()}-${f.desdeDia}_${f.hastaDia}.xlsx`
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
