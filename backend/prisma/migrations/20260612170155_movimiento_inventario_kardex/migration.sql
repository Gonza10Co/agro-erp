-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA', 'SALIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "MotivoMovimiento" AS ENUM ('PRODUCCION', 'DESPACHO', 'COMPRA', 'CONSUMO_PRODUCCION', 'DEVOLUCION_CLIENTE', 'DEVOLUCION_PROVEEDOR', 'AJUSTE_MANUAL');

-- CreateTable
CREATE TABLE "MovimientoInventario" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "motivo" "MotivoMovimiento" NOT NULL,
    "materialId" INTEGER,
    "inventarioPTId" INTEGER,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "referencia" TEXT,
    "observaciones" TEXT,
    "usuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoInventario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoInventario_materialId_createdAt_idx" ON "MovimientoInventario"("materialId", "createdAt");

-- CreateIndex
CREATE INDEX "MovimientoInventario_inventarioPTId_createdAt_idx" ON "MovimientoInventario"("inventarioPTId", "createdAt");

-- CreateIndex
CREATE INDEX "MovimientoInventario_createdAt_idx" ON "MovimientoInventario"("createdAt");

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_inventarioPTId_fkey" FOREIGN KEY ("inventarioPTId") REFERENCES "InventarioPT"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoInventario" ADD CONSTRAINT "MovimientoInventario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
