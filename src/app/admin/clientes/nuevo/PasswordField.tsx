"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

interface Props {
  name:        string
  placeholder?: string
  hint?:        string
  required?:    boolean
}

export default function PasswordField({ name, placeholder, hint, required }: Props) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Master Key
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          required={required}
          className="w-full h-11 px-3.5 pr-11 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
