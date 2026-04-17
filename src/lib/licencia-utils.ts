export interface LicenciaStatus {
  label:         string
  color:         string
  textColor:     string
  diasRestantes: number
}

export function calcularEstado(cliente: {
  suspendida:       boolean
  fechaVencimiento: Date
}): LicenciaStatus {
  const diasRestantes = Math.ceil(
    (new Date(cliente.fechaVencimiento).getTime() - Date.now()) / 86_400_000
  )

  if (cliente.suspendida || diasRestantes <= 0) {
    return { label: "Suspendida",                    color: "bg-red-100",    textColor: "text-red-700",   diasRestantes }
  }
  if (diasRestantes <= 7) {
    return { label: `${diasRestantes}d — Por vencer`, color: "bg-amber-100", textColor: "text-amber-700", diasRestantes }
  }
  return { label: "Activa", color: "bg-green-100", textColor: "text-green-700", diasRestantes }
}
