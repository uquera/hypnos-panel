-- CreateTable
CREATE TABLE "actividad_log" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT NOT NULL,
    "clienteId" TEXT,
    "clienteNombre" TEXT,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
