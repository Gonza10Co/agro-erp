-- CreateEnum
CREATE TYPE "TipoCredito" AS ENUM ('CONTADO', 'D30', 'D60', 'D90');

-- CreateEnum
CREATE TYPE "EstadoCartera" AS ENUM ('AL_DIA', 'VENCIDO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoBodega" AS ENUM ('PROPIA', 'HERMANA');

-- CreateEnum
CREATE TYPE "EstadoOC" AS ENUM ('BORRADOR', 'CONFIRMADA', 'EN_PRODUCCION', 'CERRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoOP" AS ENUM ('CREADA', 'AMARRADA', 'EN_PRODUCCION', 'ANULADA');

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nit" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT,
    "tipoCredito" "TipoCredito" NOT NULL DEFAULT 'CONTADO',
    "cupo" DECIMAL(14,2),
    "estadoCartera" "EstadoCartera" NOT NULL DEFAULT 'AL_DIA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bodega" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoBodega" NOT NULL DEFAULT 'PROPIA',
    "prioridad" INTEGER NOT NULL DEFAULT 100,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompra" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "ocCliente" TEXT,
    "clienteId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoOC" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompraLinea" (
    "id" SERIAL NOT NULL,
    "ocId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,

    CONSTRAINT "OrdenCompraLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCompraLineaTalla" (
    "id" SERIAL NOT NULL,
    "ocLineaId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "OrdenCompraLineaTalla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioPT" (
    "id" SERIAL NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "bodegaId" INTEGER NOT NULL,
    "cantDisponible" INTEGER NOT NULL DEFAULT 0,
    "cantReservada" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InventarioPT_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenProduccion" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "ocId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoOP" NOT NULL DEFAULT 'CREADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenProduccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenProduccionLinea" (
    "id" SERIAL NOT NULL,
    "opId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,

    CONSTRAINT "OrdenProduccionLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenProduccionLineaTalla" (
    "id" SERIAL NOT NULL,
    "opLineaId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "cantPedida" INTEGER NOT NULL,
    "cantAmarrada" INTEGER NOT NULL DEFAULT 0,
    "cantAProducir" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrdenProduccionLineaTalla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaInventarioPT" (
    "id" SERIAL NOT NULL,
    "opLineaTallaId" INTEGER NOT NULL,
    "inventarioPTId" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "ReservaInventarioPT_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_nit_key" ON "Cliente"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "Bodega_codigo_key" ON "Bodega"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompra_consecutivo_key" ON "OrdenCompra"("consecutivo");

-- CreateIndex
CREATE INDEX "OrdenCompra_clienteId_idx" ON "OrdenCompra"("clienteId");

-- CreateIndex
CREATE INDEX "OrdenCompraLinea_ocId_idx" ON "OrdenCompraLinea"("ocId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCompraLineaTalla_ocLineaId_tallaId_key" ON "OrdenCompraLineaTalla"("ocLineaId", "tallaId");

-- CreateIndex
CREATE INDEX "InventarioPT_productoConfiguradoId_tallaId_idx" ON "InventarioPT"("productoConfiguradoId", "tallaId");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioPT_productoConfiguradoId_tallaId_bodegaId_key" ON "InventarioPT"("productoConfiguradoId", "tallaId", "bodegaId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenProduccion_consecutivo_key" ON "OrdenProduccion"("consecutivo");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenProduccion_ocId_key" ON "OrdenProduccion"("ocId");

-- CreateIndex
CREATE INDEX "OrdenProduccionLinea_opId_idx" ON "OrdenProduccionLinea"("opId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenProduccionLineaTalla_opLineaId_tallaId_key" ON "OrdenProduccionLineaTalla"("opLineaId", "tallaId");

-- CreateIndex
CREATE INDEX "ReservaInventarioPT_opLineaTallaId_idx" ON "ReservaInventarioPT"("opLineaTallaId");

-- CreateIndex
CREATE INDEX "ReservaInventarioPT_inventarioPTId_idx" ON "ReservaInventarioPT"("inventarioPTId");

-- AddForeignKey
ALTER TABLE "Marca" ADD CONSTRAINT "Marca_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLinea" ADD CONSTRAINT "OrdenCompraLinea_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLineaTalla" ADD CONSTRAINT "OrdenCompraLineaTalla_ocLineaId_fkey" FOREIGN KEY ("ocLineaId") REFERENCES "OrdenCompraLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCompraLineaTalla" ADD CONSTRAINT "OrdenCompraLineaTalla_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioPT" ADD CONSTRAINT "InventarioPT_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioPT" ADD CONSTRAINT "InventarioPT_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioPT" ADD CONSTRAINT "InventarioPT_bodegaId_fkey" FOREIGN KEY ("bodegaId") REFERENCES "Bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenProduccion" ADD CONSTRAINT "OrdenProduccion_ocId_fkey" FOREIGN KEY ("ocId") REFERENCES "OrdenCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenProduccionLinea" ADD CONSTRAINT "OrdenProduccionLinea_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OrdenProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenProduccionLinea" ADD CONSTRAINT "OrdenProduccionLinea_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenProduccionLineaTalla" ADD CONSTRAINT "OrdenProduccionLineaTalla_opLineaId_fkey" FOREIGN KEY ("opLineaId") REFERENCES "OrdenProduccionLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenProduccionLineaTalla" ADD CONSTRAINT "OrdenProduccionLineaTalla_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaInventarioPT" ADD CONSTRAINT "ReservaInventarioPT_opLineaTallaId_fkey" FOREIGN KEY ("opLineaTallaId") REFERENCES "OrdenProduccionLineaTalla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaInventarioPT" ADD CONSTRAINT "ReservaInventarioPT_inventarioPTId_fkey" FOREIGN KEY ("inventarioPTId") REFERENCES "InventarioPT"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
