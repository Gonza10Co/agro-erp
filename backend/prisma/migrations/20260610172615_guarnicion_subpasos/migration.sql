-- CreateEnum
CREATE TYPE "SubPasoGuarnicion" AS ENUM ('AREA', 'ARMADO', 'VISTAS', 'CIERRE', 'PREFORMADO', 'PERFORADO', 'REVISION', 'STROBEL', 'AMARRE');

-- AlterTable
ALTER TABLE "EventoTrazabilidad" ADD COLUMN     "subPaso" "SubPasoGuarnicion";

-- AlterTable
ALTER TABLE "Par" ADD COLUMN     "subPasoActual" "SubPasoGuarnicion";

-- CreateIndex
CREATE INDEX "Par_subPasoActual_idx" ON "Par"("subPasoActual");
