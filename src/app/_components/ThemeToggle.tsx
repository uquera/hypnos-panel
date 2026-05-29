"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("hypnos-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("hypnos-theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex items-center gap-2.5 px-3 py-2 w-full rounded-lg text-sm font-medium text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200 transition-all"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {dark ? "Modo claro" : "Modo oscuro"}
    </button>
  );
}
