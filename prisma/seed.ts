/**
 * Seed inicial — crea el primer usuario ADMIN
 * Ejecutar con: npx ts-node prisma/seed.ts
 * O agregar al package.json:
 *   "prisma": { "seed": "ts-node prisma/seed.ts" }
 * y correr: npx prisma db seed
 */
import { config } from "dotenv"
import { resolve } from "path"
config({ path: resolve(__dirname, "../.env") })

import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import bcrypt from "bcryptjs"

const url     = process.env.DATABASE_URL || "file:./prisma/dev.db"
const adapter = new PrismaBetterSqlite3({ url })
const prisma  = new PrismaClient({ adapter })

async function main() {
  const email    = process.env.SEED_ADMIN_EMAIL    || "admin@hypnosapps.com"
  const password = process.env.SEED_ADMIN_PASSWORD || "CambiaEstaContraseña2026!"
  const nombre   = process.env.SEED_ADMIN_NOMBRE   || "Ulises Querales"

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`⚠️  Usuario ${email} ya existe — no se creó duplicado`)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { nombre, email, passwordHash, role: "ADMIN" },
  })
  console.log(`✅ Usuario ADMIN creado: ${user.email}`)
  console.log(`   Contraseña: ${password}`)
  console.log(`   ⚠️  Cambia la contraseña después del primer login`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
