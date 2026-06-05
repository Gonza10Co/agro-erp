-- CreateEnum
CREATE TYPE "EstadoRequerimiento" AS ENUM ('CALCULADO');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "proveedorId" INTEGER;

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" SERIAL NOT NULL,
    "nit" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioMaterial" (
    "id" SERIAL NOT NULL,
    "materialId" INTEGER NOT NULL,
    "cantDisponible" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequerimientoCompra" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "opId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoRequerimiento" NOT NULL DEFAULT 'CALCULADO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequerimientoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequerimientoCompraLinea" (
    "id" SERIAL NOT NULL,
    "requerimientoId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "cantNecesaria" DECIMAL(14,4) NOT NULL,
    "cantDisponible" DECIMAL(14,4) NOT NULL,
    "cantAComprar" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "RequerimientoCompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_nit_key" ON "Proveedor"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioMaterial_materialId_key" ON "InventarioMaterial"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "RequerimientoCompra_consecutivo_key" ON "RequerimientoCompra"("consecutivo");

-- CreateIndex
CREATE INDEX "RequerimientoCompra_opId_idx" ON "RequerimientoCompra"("opId");

-- CreateIndex
CREATE INDEX "RequerimientoCompraLinea_requerimientoId_idx" ON "RequerimientoCompraLinea"("requerimientoId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioMaterial" ADD CONSTRAINT "InventarioMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequerimientoCompra" ADD CONSTRAINT "RequerimientoCompra_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OrdenProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequerimientoCompraLinea" ADD CONSTRAINT "RequerimientoCompraLinea_requerimientoId_fkey" FOREIGN KEY ("requerimientoId") REFERENCES "RequerimientoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequerimientoCompraLinea" ADD CONSTRAINT "RequerimientoCompraLinea_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequerimientoCompraLinea" ADD CONSTRAINT "RequerimientoCompraLinea_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
