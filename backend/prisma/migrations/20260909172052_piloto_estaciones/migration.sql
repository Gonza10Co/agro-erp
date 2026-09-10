-- DropForeignKey
ALTER TABLE "EventoTrazabilidad" DROP CONSTRAINT "EventoTrazabilidad_maquinaId_fkey";

-- AlterTable
ALTER TABLE "EventoTrazabilidad" ADD COLUMN     "celulaDestino" "Celula",
ADD COLUMN     "estacionDestino" TEXT,
ALTER COLUMN "maquinaId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Estacion" (
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "celula" "Celula" NOT NULL,
    "subPaso" "SubPasoGuarnicion",
    "subPasoInyeccion" "SubPasoInyeccion",
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Estacion_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estacion_orden_key" ON "Estacion"("orden");

-- CreateIndex
CREATE INDEX "EventoTrazabilidad_estacionDestino_timestamp_idx" ON "EventoTrazabilidad"("estacionDestino", "timestamp");

-- AddForeignKey
ALTER TABLE "EventoTrazabilidad" ADD CONSTRAINT "EventoTrazabilidad_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "Maquina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Las 6 estaciones acordadas en planta (2026-09-09). Cierre nace apagada.
INSERT INTO "Estacion" ("codigo", "nombre", "orden", "celula", "subPaso", "subPasoInyeccion", "activa") VALUES
  ('PREPARACION',  'Preparación',           1, 'GUARNICION', 'PREPARACION', NULL,       true),
  ('CIERRE',       'Cierre',                2, 'GUARNICION', 'CIERRE',      NULL,       false),
  ('BODEGA_CORTE', 'Bodega de corte',       3, 'ALMACEN',    NULL,          NULL,       true),
  ('MONTAJE',      'Inyección · Montaje',   4, 'INYECCION',  NULL,          'MONTAJE',  true),
  ('FINIZAJE',     'Inyección · Finizaje',  5, 'INYECCION',  NULL,          'FINIZAJE', true),
  ('PT',           'Producto terminado',    6, 'PT',         NULL,          NULL,       true);
