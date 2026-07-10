-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "direccionDespacho" TEXT,
ADD COLUMN     "telefono" TEXT;

-- AlterTable
ALTER TABLE "Despacho" ADD COLUMN     "direccionEntrega" TEXT;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "costoBase" DECIMAL(14,4),
ADD COLUMN     "costoPromedio" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "MovimientoInventario" ADD COLUMN     "costoUnitario" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "OrdenCompra" ADD COLUMN     "direccionDespacho" TEXT,
ADD COLUMN     "fechaConfirmacion" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrdenCompraProveedorLinea" ADD COLUMN     "costoUnitario" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "RecepcionCompraLinea" ADD COLUMN     "costoUnitario" DECIMAL(14,4);
