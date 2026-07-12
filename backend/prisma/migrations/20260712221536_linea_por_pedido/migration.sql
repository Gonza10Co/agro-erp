-- AlterTable
ALTER TABLE "OrdenCompra" ADD COLUMN     "lineaId" INTEGER;

-- AlterTable
ALTER TABLE "OrdenProduccion" ADD COLUMN     "lineaId" INTEGER;

-- CreateIndex
CREATE INDEX "OrdenCompra_lineaId_idx" ON "OrdenCompra"("lineaId");

-- CreateIndex
CREATE INDEX "OrdenProduccion_lineaId_idx" ON "OrdenProduccion"("lineaId");

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenProduccion" ADD CONSTRAINT "OrdenProduccion_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
