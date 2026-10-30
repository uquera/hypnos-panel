import Link from "next/link"
import { buscarTokenVigente } from "@/lib/pos/tokens"
import PosAuthCard from "../_components/PosAuthCard"
import CrearContrasenaForm from "./CrearContrasenaForm"

export const metadata = { title: "Crear contraseña — Hypnos POS" }
export const dynamic = "force-dynamic"

// Destino de los enlaces de invitación (7 días) y de recuperación (1 hora).
export default async function CrearContrasenaPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams
  const registro = await buscarTokenVigente(token)

  if (!registro || !registro.usuario.activo) {
    return (
      <PosAuthCard titulo="Enlace no válido" subtitulo="Venció o ya se usó"
        pie={<Link href="/pos/login" className="text-gray-600 hover:text-gray-900">Ir a ingresar</Link>}>
        <p className="text-sm text-gray-600 text-center">
          Pide un enlace nuevo en <Link href="/pos/recuperar" className="font-semibold underline">¿Olvidaste tu contraseña?</Link> o
          solicita a quien te invitó que reenvíe la invitación.
        </p>
      </PosAuthCard>
    )
  }
  if (!registro.usuario.cuenta.activo) {
    return (
      <PosAuthCard titulo="Cuenta suspendida">
        <p className="text-sm text-gray-600 text-center">Esta cuenta está suspendida. Escribe a Hypnos: contacto@hypnosapps.com</p>
      </PosAuthCard>
    )
  }

  const invitacion = registro.tipo === "INVITACION"
  return (
    <PosAuthCard
      titulo={invitacion ? "Crea tu contraseña" : "Nueva contraseña"}
      subtitulo={`${registro.usuario.nombre} · ${registro.usuario.cuenta.nombre}`}>
      <CrearContrasenaForm token={token} email={registro.usuario.email} invitacion={invitacion} />
    </PosAuthCard>
  )
}
