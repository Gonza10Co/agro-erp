-- CreateEnum
CREATE TYPE "EstadoOrdenCorte" AS ENUM ('PROGRAMADA', 'EN_CORTE', 'ENTREGADA', 'EN_GUARNICION', 'CERRADA', 'ANULADA');

-- CreateTable
CREATE TABLE "OrdenCorte" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "lineaId" INTEGER NOT NULL,
    "marcaId" INTEGER,
    "estado" "EstadoOrdenCorte" NOT NULL DEFAULT 'PROGRAMADA',
    "inicioCorte" TIMESTAMP(3),
    "entregaCorte" TIMESTAMP(3),
    "inicioGuarnicion" TIMESTAMP(3),
    "cierreGuarnicion" TIMESTAMP(3),
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenCorte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenCorteLinea" (
    "id" SERIAL NOT NULL,
    "ordenCorteId" INTEGER NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "cantProgramada" INTEGER NOT NULL,
    "cantCortada" INTEGER NOT NULL DEFAULT 0,
    "cantAmarrada" INTEGER NOT NULL DEFAULT 0,
    "ofId" INTEGER,

    CONSTRAINT "OrdenCorteLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvanceCorte" (
    "id" SERIAL NOT NULL,
    "ordenCorteId" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "piezasCortadas" INTEGER NOT NULL,
    "piezasDanadas" INTEGER NOT NULL DEFAULT 0,
    "piezasRepuestas" INTEGER NOT NULL DEFAULT 0,
    "operarioId" INTEGER,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvanceCorte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoCorteMaterial" (
    "id" SERIAL NOT NULL,
    "avanceCorteId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "cantTeorica" DECIMAL(14,4) NOT NULL,
    "cantReal" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "ConsumoCorteMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCorte_codigo_key" ON "OrdenCorte"("codigo");

-- CreateIndex
CREATE INDEX "OrdenCorte_fecha_lineaId_idx" ON "OrdenCorte"("fecha", "lineaId");

-- CreateIndex
CREATE INDEX "OrdenCorte_estado_idx" ON "OrdenCorte"("estado");

-- CreateIndex
CREATE INDEX "OrdenCorteLinea_ofId_idx" ON "OrdenCorteLinea"("ofId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenCorteLinea_ordenCorteId_productoConfiguradoId_tallaId_key" ON "OrdenCorteLinea"("ordenCorteId", "productoConfiguradoId", "tallaId");

-- CreateIndex
CREATE INDEX "AvanceCorte_ordenCorteId_idx" ON "AvanceCorte"("ordenCorteId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoCorteMaterial_avanceCorteId_materialId_key" ON "ConsumoCorteMaterial"("avanceCorteId", "materialId");

-- AddForeignKey
ALTER TABLE "OrdenCorte" ADD CONSTRAINT "OrdenCorte_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "Linea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCorte" ADD CONSTRAINT "OrdenCorte_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCorteLinea" ADD CONSTRAINT "OrdenCorteLinea_ordenCorteId_fkey" FOREIGN KEY ("ordenCorteId") REFERENCES "OrdenCorte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCorteLinea" ADD CONSTRAINT "OrdenCorteLinea_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCorteLinea" ADD CONSTRAINT "OrdenCorteLinea_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenCorteLinea" ADD CONSTRAINT "OrdenCorteLinea_ofId_fkey" FOREIGN KEY ("ofId") REFERENCES "OrdenFabricacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvanceCorte" ADD CONSTRAINT "AvanceCorte_ordenCorteId_fkey" FOREIGN KEY ("ordenCorteId") REFERENCES "OrdenCorte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvanceCorte" ADD CONSTRAINT "AvanceCorte_operarioId_fkey" FOREIGN KEY ("operarioId") REFERENCES "Operario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoCorteMaterial" ADD CONSTRAINT "ConsumoCorteMaterial_avanceCorteId_fkey" FOREIGN KEY ("avanceCorteId") REFERENCES "AvanceCorte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoCorteMaterial" ADD CONSTRAINT "ConsumoCorteMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
