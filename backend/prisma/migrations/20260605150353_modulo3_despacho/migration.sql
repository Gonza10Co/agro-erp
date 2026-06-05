-- AlterEnum
ALTER TYPE "EstadoOP" ADD VALUE 'DESPACHADA';

-- CreateTable
CREATE TABLE "Despacho" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "opId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorizadoPorId" INTEGER,
    "motivoAutorizacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Despacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespachoLinea" (
    "id" SERIAL NOT NULL,
    "despachoId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "bodegaId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "DespachoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Despacho_consecutivo_key" ON "Despacho"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "Despacho_opId_key" ON "Despacho"("opId");

-- CreateIndex
CREATE INDEX "DespachoLinea_despachoId_idx" ON "DespachoLinea"("despachoId");

-- AddForeignKey
ALTER TABLE "Despacho" ADD CONSTRAINT "Despacho_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OrdenProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despacho" ADD CONSTRAINT "Despacho_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "Despacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
