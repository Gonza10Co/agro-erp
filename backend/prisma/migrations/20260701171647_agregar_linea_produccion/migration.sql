-- AlterTable
ALTER TABLE "Marca" ADD COLUMN     "lineaId" INTEGER;

-- CreateTable
CREATE TABLE "Linea" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celulaInicial" "Celula" NOT NULL DEFAULT 'CORTE',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Linea_codigo_key" ON "Linea"("codigo");

-- CreateIndex
CREATE INDEX "Marca_lineaId_idx" ON "Marca"("lineaId");

-- AddForeignKey
ALTER TABLE "Marca" ADD CONSTRAINT "Marca_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
