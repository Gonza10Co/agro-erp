-- AlterTable
ALTER TABLE "MovimientoInventario" ADD COLUMN     "ofId" INTEGER;

-- CreateIndex
CREATE INDEX "MovimientoInventario_ofId_idx" ON "MovimientoInventario"("ofId");

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_ofId_fkey" FOREIGN KEY ("ofId") REFERENCES "OrdenFabricacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
