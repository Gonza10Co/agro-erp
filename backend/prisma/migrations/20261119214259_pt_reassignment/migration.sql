-- AlterTable
ALTER TABLE "OrdenProduccionLineaTalla" ADD COLUMN     "reassignedOut" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PtReassignment" (
    "id" SERIAL NOT NULL,
    "fromOpId" INTEGER NOT NULL,
    "toOpId" INTEGER,
    "productoConfiguradoId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "calidad" "CalidadPT" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PtReassignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PtReassignment_fromOpId_idx" ON "PtReassignment"("fromOpId");

-- CreateIndex
CREATE INDEX "PtReassignment_toOpId_idx" ON "PtReassignment"("toOpId");

-- AddForeignKey
ALTER TABLE "PtReassignment" ADD CONSTRAINT "PtReassignment_fromOpId_fkey" FOREIGN KEY ("fromOpId") REFERENCES "OrdenProduccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtReassignment" ADD CONSTRAINT "PtReassignment_toOpId_fkey" FOREIGN KEY ("toOpId") REFERENCES "OrdenProduccion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtReassignment" ADD CONSTRAINT "PtReassignment_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtReassignment" ADD CONSTRAINT "PtReassignment_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PtReassignment" ADD CONSTRAINT "PtReassignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
