-- Hypnos POS (2026-10-30): tablas nuevas, solo aditivo (no toca tablas existentes).
-- El proyecto usa 'npx prisma db push' (ver CLAUDE.md); este SQL es la referencia equivalente
-- y sirve para aplicarlo a mano: sqlite3 prisma/prod.db < prisma/sql/20261030_hypnos_pos.sql

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_cuentas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "posUrl" TEXT NOT NULL,
    "logo" TEXT,
    "colorPrimario" TEXT NOT NULL DEFAULT '#f26522',
    "colorTextoPrimario" TEXT NOT NULL DEFAULT '#ffffff',
    "colorFondo" TEXT NOT NULL DEFAULT '#ffffff',
    "colorTexto" TEXT NOT NULL DEFAULT '#1f2937',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "clienteId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pos_cuentas_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_usuarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cuentaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "rol" TEXT NOT NULL DEFAULT 'EDITOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimoIngreso" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pos_usuarios_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "pos_cuentas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "pos_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEn" DATETIME NOT NULL,
    "usadoEn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_tokens_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "pos_usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_cuentas_codigo_key" ON "pos_cuentas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_usuarios_email_key" ON "pos_usuarios"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_usuarios_cuentaId_idx" ON "pos_usuarios"("cuentaId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pos_tokens_tokenHash_key" ON "pos_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pos_tokens_usuarioId_idx" ON "pos_tokens"("usuarioId");

