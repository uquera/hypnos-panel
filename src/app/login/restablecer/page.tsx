import { verificarTokenReset } from "@/lib/password-reset"
import RestablecerForm from "./RestablecerForm"

export const metadata = { title: "Nueva contraseña — Hypnos Panel" }
export const dynamic = "force-dynamic"

export default async function RestablecerPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams
  const user = await verificarTokenReset(token)
  return <RestablecerForm token={token} valido={!!user} email={user?.email ?? ""} />
}
