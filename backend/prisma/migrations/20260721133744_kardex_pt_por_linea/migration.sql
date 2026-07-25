-- AlterTable
ALTER TABLE "MovimientoInventario" ADD COLUMN     "lineaId" INTEGER;

-- CreateIndex
CREATE INDEX "MovimientoInventario_lineaId_createdAt_idx" ON "MovimientoInventario"("lineaId", "createdAt");

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
