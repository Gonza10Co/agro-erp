-- AlterTable
ALTER TABLE "InventarioMaterial" ADD COLUMN     "cantReservada" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RequerimientoCompra" ADD COLUMN     "reservaActiva" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "RequerimientoCompraLinea" ADD COLUMN     "cantReservada" DECIMAL(14,4) NOT NULL DEFAULT 0;
