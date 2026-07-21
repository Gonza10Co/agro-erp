-- AlterTable
ALTER TABLE "ReglaOverride" ADD COLUMN     "piezaId" INTEGER;

-- AddForeignKey
ALTER TABLE "ReglaOverride" ADD CONSTRAINT "ReglaOverride_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE SET NULL ON UPDATE CASCADE;
