-- Hypnos POS (2026-11-10): cobro en línea de la licencia con TUU (Webpay). Solo aditivo.
-- El proyecto usa 'npx prisma db push' (ver CLAUDE.md); este SQL es la referencia equivalente.
-- Antes de aplicarlo en el VPS: cp prisma/prod.db prisma/prod.db.bak-$(date +%Y%m%d-%H%M)

CREATE TABLE IF NOT EXISTS "pos_cobros_online" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referencia" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "meses" INTEGER NOT NULL,
    "monto" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "origen" TEXT NOT NULL DEFAULT 'PORTAL',
    "ambiente" TEXT NOT NULL DEFAULT 'prod',
    "resultado" TEXT,
    "detalle" TEXT,
    "pagoId" TEXT,
    "hasta" DATETIME,
    "pagadoAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pos_cobros_online_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "pos_cuentas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "pos_cobros_online_referencia_key" ON "pos_cobros_online"("referencia");
CREATE INDEX IF NOT EXISTS "pos_cobros_online_cuentaId_idx" ON "pos_cobros_online"("cuentaId");
CREATE INDEX IF NOT EXISTS "pos_cobros_online_estado_idx" ON "pos_cobros_online"("estado");
