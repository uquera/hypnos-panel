"use client"

// Cierra la sesión de soporte (la del dueño no se toca: cada navegador tiene la suya).
export default function SalirSoporte() {
  async function salir() {
    await fetch("/api/pos-portal/logout", { method: "POST" }).catch(() => null)
    window.close()
    window.location.href = "/pos/login"
  }
  return (
    <button type="button" onClick={salir} className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
      Salir<span className="hidden sm:inline"> del modo soporte</span>
    </button>
  )
}
