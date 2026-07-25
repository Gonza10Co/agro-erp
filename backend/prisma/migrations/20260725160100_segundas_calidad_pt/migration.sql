-- CreateEnum
CREATE TYPE "CalidadPT" AS ENUM ('PRIMERA', 'SEGUNDA');

-- AlterTable: el grado se sella en el par y viaja al stock cuando llega a PT.
-- Aditivas con default: todo lo que ya existe queda PRIMERA, sin pérdida de datos.
ALTER TABLE "Par" ADD COLUMN "calidad" "CalidadPT" NOT NULL DEFAULT 'PRIMERA';
ALTER TABLE "InventarioPT" ADD COLUMN "calidad" "CalidadPT" NOT NULL DEFAULT 'PRIMERA';

-- La llave del stock pasa a incluir el grado: primeras y segundas del mismo
-- producto+talla+bodega son saldos distintos. Como todas las filas existentes
-- quedan en PRIMERA, la recreación no puede chocar con duplicados.
DROP INDEX "InventarioPT_productoConfiguradoId_tallaId_bodegaId_key";
CREATE UNIQUE INDEX "InventarioPT_productoConfiguradoId_tallaId_bodegaId_calidad_key" ON "InventarioPT"("productoConfiguradoId", "tallaId", "bodegaId", "calidad");
