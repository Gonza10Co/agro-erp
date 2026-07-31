-- CreateEnum
CREATE TYPE "SubPasoInyeccion" AS ENUM ('MONTAJE', 'INYECCION', 'FINIZAJE', 'IMPACTO');

-- AlterTable
ALTER TABLE "EventoTrazabilidad" ADD COLUMN     "subPasoInyeccion" "SubPasoInyeccion";

-- AlterTable
ALTER TABLE "Par" ADD COLUMN     "subPasoInyeccion" "SubPasoInyeccion";
