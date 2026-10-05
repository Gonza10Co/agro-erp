-- CreateTable
CREATE TABLE "EtiquetaReservada" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "ofId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parId" INTEGER,
    "anulada" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EtiquetaReservada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EtiquetaReservada_codigo_key" ON "EtiquetaReservada"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "EtiquetaReservada_parId_key" ON "EtiquetaReservada"("parId");

-- CreateIndex
CREATE INDEX "EtiquetaReservada_ofId_productoConfiguradoId_tallaId_idx" ON "EtiquetaReservada"("ofId", "productoConfiguradoId", "tallaId");

-- AddForeignKey
ALTER TABLE "EtiquetaReservada" ADD CONSTRAINT "EtiquetaReservada_ofId_fkey" FOREIGN KEY ("ofId") REFERENCES "OrdenFabricacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtiquetaReservada" ADD CONSTRAINT "EtiquetaReservada_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtiquetaReservada" ADD CONSTRAINT "EtiquetaReservada_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EtiquetaReservada" ADD CONSTRAINT "EtiquetaReservada_parId_fkey" FOREIGN KEY ("parId") REFERENCES "Par"("id") ON DELETE SET NULL ON UPDATE CASCADE;

