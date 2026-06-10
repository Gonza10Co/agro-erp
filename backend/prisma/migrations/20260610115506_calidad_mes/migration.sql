-- CreateEnum
CREATE TYPE "ClaseDano" AS ENUM ('BAJA', 'REPROCESO');

-- AlterEnum
ALTER TYPE "EstadoPar" ADD VALUE 'DADO_DE_BAJA';

-- AlterTable
ALTER TABLE "Par" ADD COLUMN     "reponeAParId" INTEGER;

-- CreateTable
CREATE TABLE "TipoDano" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celulaCausante" "Celula" NOT NULL,
    "clase" "ClaseDano" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TipoDano_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidenciaCalidad" (
    "id" SERIAL NOT NULL,
    "parId" INTEGER NOT NULL,
    "tipoDanoId" INTEGER NOT NULL,
    "celulaDeteccion" "Celula" NOT NULL,
    "operarioId" INTEGER NOT NULL,
    "descripcion" TEXT,
    "autorizadoPorId" INTEGER,
    "parReposicionId" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidenciaCalidad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TipoDano_codigo_key" ON "TipoDano"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "IncidenciaCalidad_parReposicionId_key" ON "IncidenciaCalidad"("parReposicionId");

-- CreateIndex
CREATE INDEX "IncidenciaCalidad_parId_idx" ON "IncidenciaCalidad"("parId");

-- CreateIndex
CREATE INDEX "IncidenciaCalidad_tipoDanoId_idx" ON "IncidenciaCalidad"("tipoDanoId");

-- CreateIndex
CREATE INDEX "Par_reponeAParId_idx" ON "Par"("reponeAParId");

-- AddForeignKey
ALTER TABLE "Par" ADD CONSTRAINT "Par_reponeAParId_fkey" FOREIGN KEY ("reponeAParId") REFERENCES "Par"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaCalidad" ADD CONSTRAINT "IncidenciaCalidad_parId_fkey" FOREIGN KEY ("parId") REFERENCES "Par"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaCalidad" ADD CONSTRAINT "IncidenciaCalidad_tipoDanoId_fkey" FOREIGN KEY ("tipoDanoId") REFERENCES "TipoDano"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaCalidad" ADD CONSTRAINT "IncidenciaCalidad_operarioId_fkey" FOREIGN KEY ("operarioId") REFERENCES "Operario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaCalidad" ADD CONSTRAINT "IncidenciaCalidad_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidenciaCalidad" ADD CONSTRAINT "IncidenciaCalidad_parReposicionId_fkey" FOREIGN KEY ("parReposicionId") REFERENCES "Par"("id") ON DELETE SET NULL ON UPDATE CASCADE;
