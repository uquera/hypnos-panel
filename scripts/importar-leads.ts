/**
 * Importa los leads históricos de MariaDB (`hypnos.leads`) a la base del panel.
 *
 * Migración puntual: hasta agosto 2026 la landing guardaba los leads con un PHP
 * en MariaDB. Desde entonces escribe en POST /api/leads y viven en SQLite junto
 * al resto del panel. Este script trae lo que quedó del esquema anterior.
 *
 * Uso (en el VPS):
 *   mysql -N -e "SELECT JSON_OBJECT('negocio',negocio,'tipo',tipo,'nombre',nombre, \
 *     'whatsapp',whatsapp,'email',email,'origen',origen,'ip',ip, \
 *     'user_agent',user_agent,'creado_en',creado_en) FROM leads ORDER BY id" hypnos > /tmp/leads.ndjson
 *   npx tsx scripts/importar-leads.ts /tmp/leads.ndjson
 *
 * Es idempotente: reconoce un lead ya importado por negocio + nombre + fecha,
 * así que volver a correrlo no duplica nada.
 */

import { readFileSync } from "fs"
import { prisma } from "../src/lib/prisma"

interface FilaLegacy {
  negocio:    string
  tipo:       string
  nombre:     string
  whatsapp:   string
  email:      string
  origen:     string
  ip:         string
  user_agent: string
  creado_en:  string
}

async function main() {
  const archivo = process.argv[2]
  if (!archivo) {
    console.error("Falta la ruta del NDJSON. Uso: npx tsx scripts/importar-leads.ts <archivo>")
    process.exit(1)
  }

  const filas: FilaLegacy[] = readFileSync(archivo, "utf-8")
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l))

  console.log(`Leídas ${filas.length} filas de ${archivo}`)

  let creados = 0
  let saltados = 0

  for (const f of filas) {
    // MariaDB entrega "2026-08-25 15:57:01" en hora del servidor (UTC).
    const createdAt = new Date(f.creado_en.replace(" ", "T") + "Z")

    const yaExiste = await prisma.lead.findFirst({
      where: { negocio: f.negocio, nombre: f.nombre, createdAt },
    })

    if (yaExiste) {
      saltados++
      console.log(`  = ya estaba: ${f.negocio} · ${f.creado_en}`)
      continue
    }

    await prisma.lead.create({
      data: {
        negocio:   f.negocio,
        tipo:      f.tipo      ?? "",
        nombre:    f.nombre,
        whatsapp:  f.whatsapp  ?? "",
        email:     f.email     ?? "",
        origen:    f.origen    ?? "landing",
        ip:        f.ip        ?? "",
        userAgent: f.user_agent ?? "",
        estado:    "NUEVO",
        createdAt,
        updatedAt: createdAt,
      },
    })
    creados++
    console.log(`  + importado: ${f.negocio} · ${f.creado_en}`)
  }

  console.log(`\nListo. ${creados} importados, ${saltados} ya existían.`)
  console.log(`Total de leads en el panel: ${await prisma.lead.count()}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
