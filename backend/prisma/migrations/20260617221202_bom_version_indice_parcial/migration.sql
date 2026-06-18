-- DropIndex
DROP INDEX "Bom_materialId_key";

-- DropIndex
DROP INDEX "Bom_referenciaId_key";

-- CreateIndex
CREATE INDEX "Bom_referenciaId_idx" ON "Bom"("referenciaId");

-- CreateIndex
CREATE INDEX "Bom_materialId_idx" ON "Bom"("materialId");

-- Versionado de BOM: garantiza UN SOLO BOM activo por referencia y por material.
-- Índice ÚNICO PARCIAL (Prisma no lo modela; añadido a mano). Es la red de
-- seguridad del invariante "desactivar la versión anterior antes de activar la nueva".
CREATE UNIQUE INDEX "Bom_referenciaId_activo_key" ON "Bom"("referenciaId") WHERE "activo" = true;
CREATE UNIQUE INDEX "Bom_materialId_activo_key"  ON "Bom"("materialId")  WHERE "activo" = true;
