-- Factura de servicio (maquila/mantenimiento): una línea de ingreso que hoy no
-- existe porque toda factura nace de un despacho, y un servicio no despacha nada.

-- CreateEnum
CREATE TYPE "TipoFactura" AS ENUM ('PRODUCTO', 'SERVICIO');

-- CreateTable
CREATE TABLE "ServicioCatalogo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL DEFAULT 'PAR',
    "precioBase" DECIMAL(14,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicioCatalogo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServicioCatalogo_codigo_key" ON "ServicioCatalogo"("codigo");

-- AlterTable: Factura
ALTER TABLE "Factura" ADD COLUMN "tipo" "TipoFactura" NOT NULL DEFAULT 'PRODUCTO';
ALTER TABLE "Factura" ADD COLUMN "lineaId" INTEGER;
-- despachoId deja de ser obligatorio; el @unique se conserva (PG admite N NULLs).
ALTER TABLE "Factura" ALTER COLUMN "despachoId" DROP NOT NULL;

-- clienteId denormalizado. Se crea nullable, se rellena navegando la cadena que
-- hoy existe (despacho→op→oc) y recién entonces se marca NOT NULL: si el backfill
-- se saltara, la restricción reventaría contra los datos reales de producción.
ALTER TABLE "Factura" ADD COLUMN "clienteId" INTEGER;
UPDATE "Factura" f
SET "clienteId" = oc."clienteId"
FROM "Despacho" d
JOIN "OrdenProduccion" op ON op."id" = d."opId"
JOIN "OrdenCompra" oc ON oc."id" = op."ocId"
WHERE f."despachoId" = d."id";
ALTER TABLE "Factura" ALTER COLUMN "clienteId" SET NOT NULL;

CREATE INDEX "Factura_clienteId_idx" ON "Factura"("clienteId");
CREATE INDEX "Factura_lineaId_idx" ON "Factura"("lineaId");
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: FacturaLinea — producto+talla pasan a opcionales (una línea de
-- maquila no tiene talla) y entran servicio + descripción libre.
ALTER TABLE "FacturaLinea" ALTER COLUMN "productoConfiguradoId" DROP NOT NULL;
ALTER TABLE "FacturaLinea" ALTER COLUMN "tallaId" DROP NOT NULL;
ALTER TABLE "FacturaLinea" ADD COLUMN "servicioId" INTEGER;
ALTER TABLE "FacturaLinea" ADD COLUMN "descripcion" TEXT;
ALTER TABLE "FacturaLinea" ADD CONSTRAINT "FacturaLinea_servicioId_fkey" FOREIGN KEY ("servicioId") REFERENCES "ServicioCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
