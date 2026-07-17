"use client"

import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"

export default function SubmitButton({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-not-allowed`}
      style={style}
    >
      {pending ? <Loader2 size={15} className="animate-spin" /> : children}
    </button>
  )
}
