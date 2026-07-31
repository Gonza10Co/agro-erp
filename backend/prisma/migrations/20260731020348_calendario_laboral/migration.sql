-- CreateTable
CREATE TABLE "CalendarioLaboral" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lunes" BOOLEAN NOT NULL DEFAULT true,
    "martes" BOOLEAN NOT NULL DEFAULT true,
    "miercoles" BOOLEAN NOT NULL DEFAULT true,
    "jueves" BOOLEAN NOT NULL DEFAULT true,
    "viernes" BOOLEAN NOT NULL DEFAULT true,
    "sabado" BOOLEAN NOT NULL DEFAULT true,
    "domingo" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarioLaboral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiaNoHabil" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "DiaNoHabil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiaNoHabil_fecha_key" ON "DiaNoHabil"("fecha");

-- CreateIndex
CREATE INDEX "DiaNoHabil_fecha_idx" ON "DiaNoHabil"("fecha");
