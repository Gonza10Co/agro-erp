-- Materiales por talla (plantillas PU/EVA/KEVLAR…): la familia agrupa a los hermanos y
-- tallaId dice a qué talla corresponde cada uno. El resolvedor del BOM sustituye el material
-- de la línea por el de la talla pedida (antes una bota 38 descontaba una plantilla 40).
ALTER TABLE "Material" ADD COLUMN "familiaTalla" TEXT,
ADD COLUMN "tallaId" INTEGER;

-- CreateIndex
CREATE INDEX "Material_familiaTalla_tallaId_idx" ON "Material"("familiaTalla", "tallaId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE SET NULL ON UPDATE CASCADE;
