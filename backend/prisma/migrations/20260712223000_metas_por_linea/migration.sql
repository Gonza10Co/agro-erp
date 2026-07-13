-- Metas por línea: lineaId NULL = meta global (las existentes quedan globales).
-- DropIndex
DROP INDEX "Meta_anio_mes_tipo_key";

-- AlterTable
ALTER TABLE "Meta" ADD COLUMN     "lineaId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Meta_anio_mes_tipo_lineaId_key" ON "Meta"("anio", "mes", "tipo", "lineaId");

-- AddForeignKey
ALTER TABLE "Meta" ADD CONSTRAINT "Meta_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
