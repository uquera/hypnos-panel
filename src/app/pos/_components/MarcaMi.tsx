// Marca del portal de dueños (mi.hypnosapps.com): "Mi Hypnos", el centro de control de los
// dueños y administradores de franquicias. Isotipo propio: tres locales que suben (barras) en un
// cuadro oscuro con acento dorado de Hypnos.

export const MI = {
  tinta: "#0b1220",     // fondo de marca
  oro:   "#d4a72c",     // acento Hypnos
  oroSuave: "#f6ecd0",
}

export function IsotipoMi({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill={MI.tinta} />
      <rect x="9"  y="21" width="6" height="10" rx="2" fill="#ffffff" opacity="0.55" />
      <rect x="17" y="15" width="6" height="16" rx="2" fill="#ffffff" opacity="0.8" />
      <rect x="25" y="9"  width="6" height="22" rx="2" fill={MI.oro} />
    </svg>
  )
}

export function MarcaMi({ claro = false, sub, size = 36 }: { claro?: boolean; sub?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <IsotipoMi size={size} />
      <span className="leading-tight text-left">
        <span className={`block font-extrabold tracking-tight ${claro ? "text-white" : "text-gray-900"}`} style={{ fontSize: size * 0.48 }}>
          Mi <span style={{ color: MI.oro }}>Hypnos</span>
        </span>
        {sub && <span className={`block text-[11px] font-medium ${claro ? "text-white/60" : "text-gray-400"}`}>{sub}</span>}
      </span>
    </span>
  )
}
