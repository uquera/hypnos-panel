"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, Edit2, ExternalLink, Users } from "lucide-react"
import RenovarButton from "./RenovarButton"

// Lista de clientes del panel: filtro por estado y orden por columna.
// La pregunta que tiene que contestar de un vistazo es "¿a quién le vence pronto?",
// así que por defecto ordena por vencimiento, lo que vence antes arriba.
// El estado se calcula en el servidor y llega listo: calcularEstado depende de la
// hora actual y hacerlo aquí daría diferencias entre el HTML del servidor y el del
// navegador.

export interface FilaCliente {
  id:        string
  nombre:    string
  dominio:   string
  plan:      string
  url:       string
  vence:     string   // ISO
  venceTxt:  string   // ya formateado en el servidor
  grupo:     Grupo
  etiqueta:  string   // "Activa", "7d — Por vencer", "Vencida", "Suspendida"
  color:     string
  textColor: string
  dias:      number   // negativo = ya venció
}

type Grupo = "SUSPENDIDA" | "VENCIDA" | "POR_VENCER" | "ACTIVA"

// De lo más urgente a lo más tranquilo
const PESO_GRUPO: Record<Grupo, number> = { VENCIDA: 0, SUSPENDIDA: 1, POR_VENCER: 2, ACTIVA: 3 }

const FILTROS: { id: string; label: string; grupos: Grupo[] }[] = [
  { id: "todos",      label: "Todos",       grupos: [] },
  { id: "porvencer",  label: "Por vencer",  grupos: ["POR_VENCER"] },
  { id: "vencidos",   label: "Vencidos",    grupos: ["VENCIDA"] },
  { id: "suspendidos",label: "Suspendidos", grupos: ["SUSPENDIDA"] },
  { id: "activos",    label: "Activos",     grupos: ["ACTIVA"] },
]

type Col = "nombre" | "plan" | "vence" | "estado"
type Orden = { col: Col; dir: 1 | -1 }

const COLS: { id: Col; label: string }[] = [
  { id: "vence",  label: "Vencimiento" },
  { id: "estado", label: "Estado" },
  { id: "nombre", label: "Cliente" },
  { id: "plan",   label: "Plan" },
]

const POR_DEFECTO: Orden = { col: "vence", dir: 1 }
const CLAVE_ORDEN = "clientes-orden"

function valorOrden(c: FilaCliente, col: Col): string | number {
  switch (col) {
    case "nombre": return c.nombre.toLowerCase()
    case "plan":   return c.plan.toLowerCase()
    case "vence":  return Date.parse(c.vence)
    case "estado": return PESO_GRUPO[c.grupo]
  }
}

function ordenar(lista: FilaCliente[], o: Orden): FilaCliente[] {
  return [...lista].sort((a, b) => {
    const x = valorOrden(a, o.col), y = valorOrden(b, o.col)
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es")
    if (c !== 0) return c * o.dir
    // A igualdad, lo que vence antes primero; y si empatan, por nombre
    return Date.parse(a.vence) - Date.parse(b.vence) || a.nombre.localeCompare(b.nombre, "es")
  })
}

/** "en 6 días" / "hoy" / "hace 9 días": el dato que se busca al mirar la fecha. */
function cuando(dias: number): string {
  if (dias === 0)  return "hoy"
  if (dias === 1)  return "mañana"
  if (dias > 0)    return `en ${dias} días`
  if (dias === -1) return "ayer"
  return `hace ${Math.abs(dias)} días`
}

function ThOrden({ col, orden, onClick, className = "", children }: {
  col: Col; orden: Orden; onClick: (c: Col) => void; className?: string; children: React.ReactNode
}) {
  const activo = orden.col === col
  const Icono = !activo ? ArrowUpDown : orden.dir === 1 ? ArrowUp : ArrowDown
  return (
    <th className={`py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide ${className}`}
      aria-sort={activo ? (orden.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onClick(col)} title="Ordenar"
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-900 ${activo ? "text-gray-900" : ""}`}>
        {children} <Icono size={12} className={activo ? "" : "opacity-40"} />
      </button>
    </th>
  )
}

function Badge({ c }: { c: FilaCliente }) {
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${c.color} ${c.textColor}`}>
      {c.etiqueta}
    </span>
  )
}

export default function ListaClientes({ clientes }: { clientes: FilaCliente[] }) {
  const [filtro, setFiltro] = useState("todos")
  const [orden, setOrden]   = useState<Orden>(POR_DEFECTO)

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(CLAVE_ORDEN) ?? "null")
      // se lee después de montar (el servidor no tiene localStorage): evita diferencias de hidratación
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (o && COLS.some(c => c.id === o.col) && (o.dir === 1 || o.dir === -1)) setOrden(o)
    } catch { /* sin almacenamiento: orden por defecto */ }
  }, [])

  function guardar(o: Orden) {
    setOrden(o)
    try { localStorage.setItem(CLAVE_ORDEN, JSON.stringify(o)) } catch { /* nada */ }
  }
  // 1er toque: ascendente (vence: lo que vence antes primero); 2º: al revés
  const tocar = (col: Col) => guardar(orden.col !== col ? { col, dir: 1 } : { col, dir: orden.dir === 1 ? -1 : 1 })

  const conteo = useMemo(() => {
    const m: Record<string, number> = {}
    for (const F of FILTROS) m[F.id] = F.grupos.length === 0 ? clientes.length : clientes.filter(c => F.grupos.includes(c.grupo)).length
    return m
  }, [clientes])

  const lista = useMemo(() => {
    const F = FILTROS.find(x => x.id === filtro) ?? FILTROS[0]
    return ordenar(F.grupos.length === 0 ? clientes : clientes.filter(c => F.grupos.includes(c.grupo)), orden)
  }, [clientes, filtro, orden])

  if (clientes.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <Users size={40} className="text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No hay clientes registrados</p>
        <p className="text-sm text-gray-400 mt-1">Agrega tu primer cliente con el botón de arriba</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filtros por estado: los que no tienen a nadie no estorban */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.filter(F => F.id === "todos" || conteo[F.id] > 0 || F.id === filtro).map(F => (
          <button key={F.id} type="button" onClick={() => setFiltro(F.id)}
            className={`px-3 h-8 rounded-full text-xs font-semibold transition-colors ${filtro === F.id ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {F.label} <span className="opacity-60">{conteo[F.id]}</span>
          </button>
        ))}
      </div>

      {/* En móvil no hay encabezados que tocar */}
      <div className="sm:hidden flex items-center gap-2 text-sm">
        <span className="text-gray-500 shrink-0">Ordenar por</span>
        <select value={`${orden.col}:${orden.dir}`}
          onChange={e => { const [c, d] = e.target.value.split(":"); guardar({ col: c as Col, dir: Number(d) === -1 ? -1 : 1 }) }}
          className="flex-1 h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-sm">
          <option value="vence:1">Vencimiento (más próximo)</option>
          <option value="vence:-1">Vencimiento (más lejano)</option>
          <option value="estado:1">Estado (más urgente)</option>
          <option value="nombre:1">Cliente (A-Z)</option>
          <option value="plan:1">Plan</option>
        </select>
      </div>

      {lista.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">Ningún cliente en este estado.</p>
        </div>
      ) : (
        <>
          {/* Cards — móvil (< sm) */}
          <div className="sm:hidden space-y-3">
            {lista.map(c => (
              <div key={c.id} className="relative bg-white rounded-xl border border-gray-100 shadow-sm p-4 transition-colors hover:border-indigo-200">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* Enlace estirado: la tarjeta entera abre la ficha sin anidar
                        anchors, y los botones de abajo siguen siendo suyos. */}
                    <Link href={`/admin/clientes/${c.id}`}
                      className="font-semibold text-gray-900 truncate block after:absolute after:inset-0 after:content-['']">
                      {c.nombre}
                    </Link>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{c.dominio}</p>
                  </div>
                  <span className="shrink-0"><Badge c={c} /></span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">{c.plan}</span>
                  <span className="text-xs text-gray-500">{c.venceTxt}</span>
                  <span className={`text-xs ${c.dias <= 7 ? "text-amber-600 font-medium" : "text-gray-400"}`}>· {cuando(c.dias)}</span>
                </div>
                <div className="relative z-10 flex items-center gap-2 mt-3 pt-3 border-t border-gray-50">
                  <RenovarButton clienteId={c.id} clienteNombre={c.nombre} />
                  <Link href={`/admin/clientes/${c.id}`}
                    className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                    <Edit2 size={13} /> Editar
                  </Link>
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    className="h-9 px-3 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Tabla — tablet y desktop (>= sm) */}
          <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <ThOrden col="nombre" orden={orden} onClick={tocar} className="text-left px-5">Cliente</ThOrden>
                  <ThOrden col="plan"   orden={orden} onClick={tocar} className="text-left px-4">Plan</ThOrden>
                  <ThOrden col="vence"  orden={orden} onClick={tocar} className="text-left px-4">Vencimiento</ThOrden>
                  <ThOrden col="estado" orden={orden} onClick={tocar} className="text-left px-4">Estado</ThOrden>
                  <th className="text-right px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(c => (
                  <tr key={c.id} className="relative cursor-pointer hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-4">
                      {/* Enlace estirado: cubre la fila entera con ::after, así
                          toda la fila abre la ficha del cliente y su historial.
                          Sigue siendo un <a> de verdad: teclado, ctrl+clic y
                          botón central funcionan. Anidar anchors no es válido,
                          por eso los botones de Acciones van sobre él (z-10). */}
                      <Link href={`/admin/clientes/${c.id}`}
                        className="font-semibold text-gray-900 hover:text-indigo-700 after:absolute after:inset-0 after:content-['']">
                        {c.nombre}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">{c.dominio}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">{c.plan}</span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">
                      {c.venceTxt}
                      <span className={`block text-xs ${c.dias <= 7 ? "text-amber-600 font-medium" : "text-gray-400"}`}>{cuando(c.dias)}</span>
                    </td>
                    <td className="px-4 py-4"><Badge c={c} /></td>
                    <td className="px-5 py-4">
                      <div className="relative z-10 flex items-center justify-end gap-2">
                        <a href={c.url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" title="Ver sitio">
                          <ExternalLink size={15} />
                        </a>
                        <RenovarButton clienteId={c.id} clienteNombre={c.nombre} />
                        <Link href={`/admin/clientes/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                          <Edit2 size={12} /> Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
