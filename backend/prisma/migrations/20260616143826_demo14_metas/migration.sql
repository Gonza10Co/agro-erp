-- CreateEnum
CREATE TYPE "TipoMeta" AS ENUM ('GUARNICION', 'INYECCION', 'FACTURACION_PARES', 'FACTURACION_VALOR');

-- CreateTable
CREATE TABLE "Meta" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "tipo" "TipoMeta" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meta_anio_mes_tipo_key" ON "Meta"("anio", "mes", "tipo");
