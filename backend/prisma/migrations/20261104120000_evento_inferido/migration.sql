-- Salto de estación: un evento puede ser inferido (nadie hizo ese pistolazo) y por eso no siempre tiene operario.
ALTER TABLE "EventoTrazabilidad" ALTER COLUMN "operarioId" DROP NOT NULL;
ALTER TABLE "EventoTrazabilidad" ADD COLUMN "inferido" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EventoTrazabilidad" ADD COLUMN "motivo" TEXT;
ALTER TABLE "EventoTrazabilidad" ADD COLUMN "registradoPorId" INTEGER;
ALTER TABLE "EventoTrazabilidad" ADD CONSTRAINT "EventoTrazabilidad_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
