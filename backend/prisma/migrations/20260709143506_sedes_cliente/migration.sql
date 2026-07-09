-- Sedes de entrega por cliente (1→N). Reemplazan a `Cliente.direccionDespacho`:
-- ahora el destino por defecto de un pedido es la sede marcada como principal.

-- CreateTable
CREATE TABLE "SedeCliente" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "telefono" TEXT,
    "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SedeCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SedeCliente_clienteId_idx" ON "SedeCliente"("clienteId");

-- Un cliente no puede tener dos sedes principales. Índice único PARCIAL: solo alcanza
-- a las filas con esPrincipal = true, de modo que sí admite N sedes secundarias.
CREATE UNIQUE INDEX "SedeCliente_clienteId_principal_key"
    ON "SedeCliente"("clienteId")
    WHERE "esPrincipal";

-- AddForeignKey
ALTER TABLE "SedeCliente" ADD CONSTRAINT "SedeCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: cada cliente que ya tenía dirección de despacho estrena su sede principal,
-- así nadie pierde el destino que ya había cargado.
-- (En producción esa columna nace vacía en la migración anterior, así que no mueve nada.)
INSERT INTO "SedeCliente" ("clienteId", "nombre", "ciudad", "direccion", "telefono", "esPrincipal", "activo", "updatedAt")
SELECT
    "id",
    'Principal',
    COALESCE(NULLIF(TRIM("ciudad"), ''), 'Sin ciudad'),
    "direccionDespacho",
    "telefono",
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
FROM "Cliente"
WHERE "direccionDespacho" IS NOT NULL AND TRIM("direccionDespacho") <> '';

-- AlterTable: ya migrado el dato, la columna vieja se va.
ALTER TABLE "Cliente" DROP COLUMN "direccionDespacho";

-- AlterTable
ALTER TABLE "OrdenCompra" ADD COLUMN     "sedeEntregaId" INTEGER;

-- CreateIndex
CREATE INDEX "OrdenCompra_sedeEntregaId_idx" ON "OrdenCompra"("sedeEntregaId");

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_sedeEntregaId_fkey" FOREIGN KEY ("sedeEntregaId") REFERENCES "SedeCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
