-- Número de entrega por despacho: "Entrega 1", "Entrega 2"… dentro de cada OP, y la
-- marca de la entrega que cerró el pedido.

-- AlterTable
ALTER TABLE "Despacho" ADD COLUMN     "deliveryNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isFinal" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (solo escribe las columnas nuevas): el ordinal sale del orden de creación
-- dentro de la OP (fecha y, en empate, id).
UPDATE "Despacho" d
SET "deliveryNumber" = n.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "opId" ORDER BY "fecha", "id") AS rn
  FROM "Despacho"
) n
WHERE n."id" = d."id";

-- La última entrega de una OP ya despachada es la que la cerró.
UPDATE "Despacho" d
SET "isFinal" = true
FROM "OrdenProduccion" op
WHERE op."id" = d."opId"
  AND op."estado" = 'DESPACHADA'
  AND d."deliveryNumber" = (SELECT MAX(x."deliveryNumber") FROM "Despacho" x WHERE x."opId" = d."opId");

-- CreateIndex
CREATE UNIQUE INDEX "Despacho_opId_deliveryNumber_key" ON "Despacho"("opId", "deliveryNumber");
