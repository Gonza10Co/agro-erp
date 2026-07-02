-- AlterTable
ALTER TABLE "Par" ADD COLUMN     "lineaId" INTEGER;

-- Backfill: copia la línea de la marca del producto a cada par existente.
-- Hoy ninguna marca tiene línea asignada (el mapeo lo entrega el cliente),
-- así que esto deja lineaId en NULL; queda correcto si se corre sobre datos
-- con marcas ya clasificadas.
UPDATE "Par" p
SET "lineaId" = m."lineaId"
FROM "ProductoConfigurado" pc
JOIN "Marca" m ON m."id" = pc."marcaId"
WHERE pc."id" = p."productoConfiguradoId" AND m."lineaId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Par_lineaId_idx" ON "Par"("lineaId");

-- AddForeignKey
ALTER TABLE "Par" ADD CONSTRAINT "Par_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
