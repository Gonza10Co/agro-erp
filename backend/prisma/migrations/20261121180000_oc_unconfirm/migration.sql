-- Devolver a borrador una OC confirmada: rastro de quién, cuándo y qué OP se borró.
-- Columnas nuevas y nullable: no tocan los pedidos existentes.
ALTER TABLE "OrdenCompra" ADD COLUMN "unconfirmedAt" TIMESTAMP(3),
ADD COLUMN "unconfirmedById" INTEGER,
ADD COLUMN "unconfirmedOpNumber" INTEGER;

-- AddForeignKey
ALTER TABLE "OrdenCompra" ADD CONSTRAINT "OrdenCompra_unconfirmedById_fkey" FOREIGN KEY ("unconfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
