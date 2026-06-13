-- CreateEnum
CREATE TYPE "EstadoOrdenCompraProveedor" AS ENUM ('PENDIENTE', 'PARCIAL', 'COMPLETA');

-- AlterEnum
ALTER TYPE "EstadoRequerimiento" ADD VALUE 'CON_ORDEN';

-- CreateTable
CREATE TABLE "OrdenCompraProveedor" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "requerimientoId" INTEGER,
    "estado" "EstadoOrdenCompraProveedor" NOT NULL DEFAULT 'PENDIENTE',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenCompraProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompraProveedorLinea" (
    "id" SERIAL NOT NULL,
    "ocpId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "cantPedida" DECIMAL(14,4) NOT NULL,
    "cantRecibida" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "OrdenCompraProveedorLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecepcionCompra" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "ocpId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observaciones" TEXT,
    "usuarioId" INTEGER,

    CONSTRAINT "RecepcionCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecepcionCompraLinea" (
    "id" SERIAL NOT NULL,
    "recepcionId" INTEGER NOT NULL,
    "ocpLineaId" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "RecepcionCompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionProveedor" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "ocpId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "causa" TEXT NOT NULL,
    "observaciones" TEXT,
    "usuarioId" INTEGER,

    CONSTRAINT "DevolucionProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevolucionProveedorLinea" (
    "id" SERIAL NOT NULL,
    "devolucionId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "DevolucionProveedorLinea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompraProveedor_consecutivo_key" ON "OrdenCompraProveedor"("consecutivo");

-- CreateIndex
CREATE INDEX "OrdenCompraProveedor_proveedorId_idx" ON "OrdenCompraProveedor"("proveedorId");

-- CreateIndex
CREATE INDEX "OrdenCompraProveedor_requerimientoId_idx" ON "OrdenCompraProveedor"("requerimientoId");

-- CreateIndex
CREATE INDEX "OrdenCompraProveedorLinea_ocpId_idx" ON "OrdenCompraProveedorLinea"("ocpId");

-- CreateIndex
CREATE UNIQUE INDEX "RecepcionCompra_consecutivo_key" ON "RecepcionCompra"("consecutivo");

-- CreateIndex
CREATE INDEX "RecepcionCompra_ocpId_idx" ON "RecepcionCompra"("ocpId");

-- CreateIndex
CREATE INDEX "RecepcionCompraLinea_recepcionId_idx" ON "RecepcionCompraLinea"("recepcionId");

-- CreateIndex
CREATE UNIQUE INDEX "DevolucionProveedor_consecutivo_key" ON "DevolucionProveedor"("consecutivo");

-- CreateIndex
CREATE INDEX "DevolucionProveedor_ocpId_idx" ON "DevolucionProveedor"("ocpId");

-- CreateIndex
CREATE INDEX "DevolucionProveedorLinea_devolucionId_idx" ON "DevolucionProveedorLinea"("devolucionId");

-- AddForeignKey
ALTER TABLE "OrdenCompraProveedor" ADD CONSTRAINT "OrdenCompraProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraProveedor" ADD CONSTRAINT "OrdenCompraProveedor_requerimientoId_fkey" FOREIGN KEY ("requerimientoId") REFERENCES "RequerimientoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraProveedorLinea" ADD CONSTRAINT "OrdenCompraProveedorLinea_ocpId_fkey" FOREIGN KEY ("ocpId") REFERENCES "OrdenCompraProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraProveedorLinea" ADD CONSTRAINT "OrdenCompraProveedorLinea_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_ocpId_fkey" FOREIGN KEY ("ocpId") REFERENCES "OrdenCompraProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompra" ADD CONSTRAINT "RecepcionCompra_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_recepcionId_fkey" FOREIGN KEY ("recepcionId") REFERENCES "RecepcionCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecepcionCompraLinea" ADD CONSTRAINT "RecepcionCompraLinea_ocpLineaId_fkey" FOREIGN KEY ("ocpLineaId") REFERENCES "OrdenCompraProveedorLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionProveedor" ADD CONSTRAINT "DevolucionProveedor_ocpId_fkey" FOREIGN KEY ("ocpId") REFERENCES "OrdenCompraProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionProveedor" ADD CONSTRAINT "DevolucionProveedor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionProveedorLinea" ADD CONSTRAINT "DevolucionProveedorLinea_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "DevolucionProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevolucionProveedorLinea" ADD CONSTRAINT "DevolucionProveedorLinea_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
