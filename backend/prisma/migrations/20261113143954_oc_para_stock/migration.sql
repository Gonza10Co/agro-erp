-- Pedido para stock (orden de mínimos): su OP no amarra bodega.
ALTER TABLE "OrdenCompra" ADD COLUMN     "paraStock" BOOLEAN NOT NULL DEFAULT false;
