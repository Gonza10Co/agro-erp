-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('EMITIDA', 'ANULADA');

-- AlterTable
ALTER TABLE "OrdenCompraLinea" ADD COLUMN     "precioUnitario" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "Factura" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "despachoId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "ivaPct" DECIMAL(5,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'EMITIDA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaLinea" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "FacturaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Factura_consecutivo_key" ON "Factura"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_despachoId_key" ON "Factura"("despachoId");

-- CreateIndex
CREATE INDEX "FacturaLinea_facturaId_idx" ON "FacturaLinea"("facturaId");

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_despachoId_fkey" FOREIGN KEY ("despachoId") REFERENCES "Despacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaLinea" ADD CONSTRAINT "FacturaLinea_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaLinea" ADD CONSTRAINT "FacturaLinea_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaLinea" ADD CONSTRAINT "FacturaLinea_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Secuencia atómica para el consecutivo de factura (elimina la carrera del patrón MAX+1).
CREATE SEQUENCE IF NOT EXISTS "factura_consecutivo_seq";
SELECT setval('factura_consecutivo_seq', COALESCE((SELECT MAX("consecutivo") FROM "Factura"), 0) + 1, false);
