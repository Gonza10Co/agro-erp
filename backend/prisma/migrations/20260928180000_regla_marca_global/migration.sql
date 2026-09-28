-- Materiales propios de la marca: una regla con referenciaId NULL aplica a TODAS las
-- referencias cuando el pedido lleva esa marca (se define una vez por marca, no por ref × marca).
ALTER TABLE "ReglaOverride" ALTER COLUMN "referenciaId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ReglaOverride_marcaId_idx" ON "ReglaOverride"("marcaId");
