-- Modo sin internet: id del pistolazo puesto por la tablet (idempotencia de la cola).
-- Columna nueva y nullable: no toca los eventos existentes.
ALTER TABLE "EventoTrazabilidad" ADD COLUMN "clientScanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventoTrazabilidad_clientScanId_key" ON "EventoTrazabilidad"("clientScanId");
