-- Despacho parcial: una OP puede salir en varios despachos.

-- DropIndex
DROP INDEX "Despacho_opId_key";

-- AlterTable
ALTER TABLE "OrdenProduccionLineaTalla" ADD COLUMN     "dispatched" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Despacho_opId_idx" ON "Despacho"("opId");

-- Backfill: hasta hoy el despacho era todo o nada y solo se permitía con todo el pedido
-- en bodega, así que una OP que ya tiene despacho salió completa. Su despachado es
-- toda la necesidad de cada talla (amarrado + a producir − cedido), y con eso queda
-- en pendiente cero. Solo escribe la columna nueva: no toca ningún dato existente.
UPDATE "OrdenProduccionLineaTalla" olt
SET "dispatched" = GREATEST(olt."cantAmarrada" + olt."cantAProducir" - olt."reassignedOut", 0)
FROM "OrdenProduccionLinea" ol
WHERE ol."id" = olt."opLineaId"
  AND EXISTS (SELECT 1 FROM "Despacho" d WHERE d."opId" = ol."opId");
