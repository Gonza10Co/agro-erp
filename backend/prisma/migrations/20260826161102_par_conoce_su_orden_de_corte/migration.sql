-- AlterTable
ALTER TABLE "Linea" ADD COLUMN     "subPasoInicial" "SubPasoGuarnicion";

-- AlterTable
ALTER TABLE "Par" ADD COLUMN     "ordenCorteId" INTEGER;

-- CreateIndex
CREATE INDEX "Par_ordenCorteId_idx" ON "Par"("ordenCorteId");

-- AddForeignKey
ALTER TABLE "Par" ADD CONSTRAINT "Par_ordenCorteId_fkey" FOREIGN KEY ("ordenCorteId") REFERENCES "OrdenCorte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
