-- CreateEnum
CREATE TYPE "Celula" AS ENUM ('CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT');

-- CreateEnum
CREATE TYPE "EstadoOF" AS ENUM ('ABIERTA', 'EN_PROCESO', 'TERMINADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoPar" AS ENUM ('EN_PROCESO', 'TERMINADO');

-- CreateTable
CREATE TABLE "OrdenFabricacion" (
    "id" SERIAL NOT NULL,
    "consecutivo" INTEGER NOT NULL,
    "opId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoOF" NOT NULL DEFAULT 'ABIERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenFabricacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Par" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "ofId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "celulaActual" "Celula" NOT NULL DEFAULT 'CORTE',
    "estado" "EstadoPar" NOT NULL DEFAULT 'EN_PROCESO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Par_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoTrazabilidad" (
    "id" SERIAL NOT NULL,
    "parId" INTEGER NOT NULL,
    "celula" "Celula" NOT NULL,
    "operarioId" INTEGER NOT NULL,
    "maquinaId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoTrazabilidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "celula" "Celula" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Operario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Maquina" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "celula" "Celula" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Maquina_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenFabricacion_consecutivo_key" ON "OrdenFabricacion"("consecutivo");

-- CreateIndex
CREATE INDEX "OrdenFabricacion_opId_idx" ON "OrdenFabricacion"("opId");

-- CreateIndex
CREATE UNIQUE INDEX "Par_codigo_key" ON "Par"("codigo");

-- CreateIndex
CREATE INDEX "Par_ofId_idx" ON "Par"("ofId");

-- CreateIndex
CREATE INDEX "Par_celulaActual_idx" ON "Par"("celulaActual");

-- CreateIndex
CREATE INDEX "EventoTrazabilidad_parId_idx" ON "EventoTrazabilidad"("parId");

-- CreateIndex
CREATE INDEX "EventoTrazabilidad_celula_idx" ON "EventoTrazabilidad"("celula");

-- CreateIndex
CREATE UNIQUE INDEX "Maquina_codigo_key" ON "Maquina"("codigo");

-- AddForeignKey
ALTER TABLE "OrdenFabricacion" ADD CONSTRAINT "OrdenFabricacion_opId_fkey" FOREIGN KEY ("opId") REFERENCES "OrdenProduccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Par" ADD CONSTRAINT "Par_ofId_fkey" FOREIGN KEY ("ofId") REFERENCES "OrdenFabricacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Par" ADD CONSTRAINT "Par_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Par" ADD CONSTRAINT "Par_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoTrazabilidad" ADD CONSTRAINT "EventoTrazabilidad_parId_fkey" FOREIGN KEY ("parId") REFERENCES "Par"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoTrazabilidad" ADD CONSTRAINT "EventoTrazabilidad_operarioId_fkey" FOREIGN KEY ("operarioId") REFERENCES "Operario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoTrazabilidad" ADD CONSTRAINT "EventoTrazabilidad_maquinaId_fkey" FOREIGN KEY ("maquinaId") REFERENCES "Maquina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
