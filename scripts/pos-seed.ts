/**
 * Datos iniciales de Hypnos POS: crea la cuenta "donaany" (Doña Any) con su logo.
 *
 * Uso (local o en el VPS, desde la carpeta del panel):
 *   npx tsx scripts/pos-seed.ts            # crea lo que falte; no pisa cambios hechos desde el panel
 *   npx tsx scripts/pos-seed.ts --forzar   # vuelve nombre, link, colores y logo a los valores de aquí
 *
 * Idempotente: si la cuenta ya existe solo completa el logo cuando falta.
 * No crea sub-cuentas: esas se invitan desde /admin/pos.
 * Usa DATABASE_URL y POS_UPLOAD_DIR del .env.
 */

import "dotenv/config"
import path from "path"
import { readFileSync } from "fs"
import { prisma } from "../src/lib/prisma"
import { guardarLogo, normalizarLogo } from "../src/lib/pos/logo"

const CUENTAS = [
  {
    codigo:             "donaany",
    nombre:             "Doña Any",
    posUrl:             "https://donnaany.com/pos",
    colorPrimario:      "#f26522",
    colorTextoPrimario: "#ffffff",
    colorFondo:         "#ffffff",
    colorTexto:         "#1f2937",
    logo:               path.join(__dirname, "assets", "pos", "donaany.png"),
  },
]

async function main() {
  const forzar = process.argv.includes("--forzar")

  for (const { logo: archivoLogo, ...datos } of CUENTAS) {
    let cuenta = await prisma.posCuenta.findUnique({ where: { codigo: datos.codigo } })
    if (!cuenta) {
      cuenta = await prisma.posCuenta.create({ data: datos })
      console.log(`+ cuenta ${datos.codigo} creada`)
    } else if (forzar) {
      cuenta = await prisma.posCuenta.update({ where: { id: cuenta.id }, data: datos })
      console.log(`~ cuenta ${datos.codigo} restablecida (--forzar)`)
    } else {
      console.log(`= cuenta ${datos.codigo} ya existe`)
    }

    if (!cuenta.logo || forzar) {
      const buf = readFileSync(archivoLogo)
      const png = await normalizarLogo(new File([new Uint8Array(buf)], path.basename(archivoLogo), { type: "image/png" }))
      const logo = await guardarLogo(cuenta.id, png)
      await prisma.posCuenta.update({ where: { id: cuenta.id }, data: { logo, updatedAt: new Date() } })
      console.log(`  logo guardado (${Math.round(png.length / 1024)} KB)`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
