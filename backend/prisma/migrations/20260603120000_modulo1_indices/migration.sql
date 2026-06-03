-- CreateIndex
CREATE INDEX "BomLinea_bomId_idx" ON "BomLinea"("bomId");

-- CreateIndex
CREATE INDEX "BomLinea_materialId_idx" ON "BomLinea"("materialId");

-- CreateIndex
CREATE INDEX "ReglaOverride_referenciaId_idx" ON "ReglaOverride"("referenciaId");

-- CreateIndex
CREATE INDEX "ReglaOverride_materialObjetivoId_idx" ON "ReglaOverride"("materialObjetivoId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "MaterialAlias_materialId_textoLegacy_key" ON "MaterialAlias"("materialId", "textoLegacy");
