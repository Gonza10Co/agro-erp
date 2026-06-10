-- AlterTable
ALTER TABLE "Factura" ADD COLUMN     "fechaVencimiento" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pago_facturaId_idx" ON "Pago"("facturaId");

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
