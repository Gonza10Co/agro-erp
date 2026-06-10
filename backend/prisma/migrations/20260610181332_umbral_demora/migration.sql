-- CreateTable
CREATE TABLE "UmbralDemora" (
    "id" SERIAL NOT NULL,
    "celula" "Celula" NOT NULL,
    "minutos" INTEGER NOT NULL,

    CONSTRAINT "UmbralDemora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UmbralDemora_celula_key" ON "UmbralDemora"("celula");
