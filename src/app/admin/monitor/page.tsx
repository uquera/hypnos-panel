import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function MonitorPage() {
  const session = await auth()
  if (!session) redirect("/login")
  if (session.user.role !== "ADMIN") redirect("/admin")

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100vh-4rem)] lg:h-screen">
      <iframe
        src="/monitor"
        className="w-full h-full border-0"
        title="Monitor de ingenieros"
        allow="fullscreen"
      />
    </div>
  );
}
