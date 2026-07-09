-- AlterTable
ALTER TABLE "BomLinea" ADD COLUMN     "piezaId" INTEGER;

-- CreateTable
CREATE TABLE "Pieza" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 100,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Pieza_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pieza_codigo_key" ON "Pieza"("codigo");

-- CreateIndex
CREATE INDEX "BomLinea_piezaId_idx" ON "BomLinea"("piezaId");

-- AddForeignKey
ALTER TABLE "BomLinea" ADD CONSTRAINT "BomLinea_piezaId_fkey" FOREIGN KEY ("piezaId") REFERENCES "Pieza"("id") ON DELETE SET NULL ON UPDATE CASCADE;
