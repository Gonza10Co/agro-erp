-- CreateEnum
CREATE TYPE "OrigenMaterial" AS ENUM ('COMPRADO', 'FABRICADO');

-- CreateEnum
CREATE TYPE "ClaseBom" AS ENUM ('DIRECTO_CURVA', 'DIRECTO_FIJO', 'INDIRECTO');

-- CreateEnum
CREATE TYPE "ClaseConsumo" AS ENUM ('CURVA', 'FIJO');

-- CreateEnum
CREATE TYPE "AccionOverride" AS ENUM ('ADD', 'REPLACE', 'REMOVE', 'SET_CONSUMO');

-- CreateEnum
CREATE TYPE "TipoMarca" AS ENUM ('PROPIA', 'MAQUILA');

-- CreateTable
CREATE TABLE "UnidadMedida" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "UnidadMedida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaMaterial" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "CategoriaMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombreCanonico" TEXT NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "unidadMedidaId" INTEGER NOT NULL,
    "origen" "OrigenMaterial" NOT NULL,
    "claseBom" "ClaseBom" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialAlias" (
    "id" SERIAL NOT NULL,
    "materialId" INTEGER NOT NULL,
    "textoLegacy" TEXT NOT NULL,

    CONSTRAINT "MaterialAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Talla" (
    "id" SERIAL NOT NULL,
    "valor" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Talla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referencia" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombreInterno" TEXT NOT NULL,
    "tallaMinId" INTEGER NOT NULL,
    "tallaMaxId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Referencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" SERIAL NOT NULL,
    "referenciaId" INTEGER,
    "materialId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "vigenteDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomLinea" (
    "id" SERIAL NOT NULL,
    "bomId" INTEGER NOT NULL,
    "materialId" INTEGER NOT NULL,
    "claseConsumo" "ClaseConsumo" NOT NULL,
    "consumoFijo" DECIMAL(65,30),
    "mermaPct" DECIMAL(65,30),
    "notas" TEXT,

    CONSTRAINT "BomLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomLineaTalla" (
    "id" SERIAL NOT NULL,
    "bomLineaId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "consumo" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "BomLineaTalla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoOpcion" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GrupoOpcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opcion" (
    "id" SERIAL NOT NULL,
    "grupoOpcionId" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Opcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marca" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMarca" NOT NULL,
    "clienteId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaOverride" (
    "id" SERIAL NOT NULL,
    "referenciaId" INTEGER NOT NULL,
    "opcionId" INTEGER,
    "marcaId" INTEGER,
    "accion" "AccionOverride" NOT NULL,
    "materialObjetivoId" INTEGER,
    "materialNuevoId" INTEGER,
    "consumoFijo" DECIMAL(65,30),
    "heredaCurva" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReglaOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaOverrideTalla" (
    "id" SERIAL NOT NULL,
    "reglaOverrideId" INTEGER NOT NULL,
    "tallaId" INTEGER NOT NULL,
    "consumo" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "ReglaOverrideTalla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenciaEje" (
    "id" SERIAL NOT NULL,
    "referenciaId" INTEGER NOT NULL,
    "grupoOpcionId" INTEGER NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReferenciaEje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenciaMarca" (
    "id" SERIAL NOT NULL,
    "referenciaId" INTEGER NOT NULL,
    "marcaId" INTEGER NOT NULL,

    CONSTRAINT "ReferenciaMarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoConfigurado" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombreComercial" TEXT NOT NULL,
    "referenciaId" INTEGER NOT NULL,
    "marcaId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductoConfigurado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoConfiguradoOpcion" (
    "id" SERIAL NOT NULL,
    "productoConfiguradoId" INTEGER NOT NULL,
    "opcionId" INTEGER NOT NULL,

    CONSTRAINT "ProductoConfiguradoOpcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnidadMedida_codigo_key" ON "UnidadMedida"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaMaterial_nombre_key" ON "CategoriaMaterial"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Material_codigo_key" ON "Material"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Talla_valor_key" ON "Talla"("valor");

-- CreateIndex
CREATE UNIQUE INDEX "Referencia_codigo_key" ON "Referencia"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_referenciaId_key" ON "Bom"("referenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_materialId_key" ON "Bom"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "BomLineaTalla_bomLineaId_tallaId_key" ON "BomLineaTalla"("bomLineaId", "tallaId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoOpcion_codigo_key" ON "GrupoOpcion"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Opcion_grupoOpcionId_codigo_key" ON "Opcion"("grupoOpcionId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Marca_codigo_key" ON "Marca"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ReglaOverrideTalla_reglaOverrideId_tallaId_key" ON "ReglaOverrideTalla"("reglaOverrideId", "tallaId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenciaEje_referenciaId_grupoOpcionId_key" ON "ReferenciaEje"("referenciaId", "grupoOpcionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenciaMarca_referenciaId_marcaId_key" ON "ReferenciaMarca"("referenciaId", "marcaId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoConfigurado_codigo_key" ON "ProductoConfigurado"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoConfiguradoOpcion_productoConfiguradoId_opcionId_key" ON "ProductoConfiguradoOpcion"("productoConfiguradoId", "opcionId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_unidadMedidaId_fkey" FOREIGN KEY ("unidadMedidaId") REFERENCES "UnidadMedida"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialAlias" ADD CONSTRAINT "MaterialAlias_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referencia" ADD CONSTRAINT "Referencia_tallaMinId_fkey" FOREIGN KEY ("tallaMinId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referencia" ADD CONSTRAINT "Referencia_tallaMaxId_fkey" FOREIGN KEY ("tallaMaxId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "Referencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLinea" ADD CONSTRAINT "BomLinea_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLinea" ADD CONSTRAINT "BomLinea_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLineaTalla" ADD CONSTRAINT "BomLineaTalla_bomLineaId_fkey" FOREIGN KEY ("bomLineaId") REFERENCES "BomLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLineaTalla" ADD CONSTRAINT "BomLineaTalla_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opcion" ADD CONSTRAINT "Opcion_grupoOpcionId_fkey" FOREIGN KEY ("grupoOpcionId") REFERENCES "GrupoOpcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverride" ADD CONSTRAINT "ReglaOverride_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "Referencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverride" ADD CONSTRAINT "ReglaOverride_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "Opcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverride" ADD CONSTRAINT "ReglaOverride_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverride" ADD CONSTRAINT "ReglaOverride_materialObjetivoId_fkey" FOREIGN KEY ("materialObjetivoId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverride" ADD CONSTRAINT "ReglaOverride_materialNuevoId_fkey" FOREIGN KEY ("materialNuevoId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverrideTalla" ADD CONSTRAINT "ReglaOverrideTalla_reglaOverrideId_fkey" FOREIGN KEY ("reglaOverrideId") REFERENCES "ReglaOverride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaOverrideTalla" ADD CONSTRAINT "ReglaOverrideTalla_tallaId_fkey" FOREIGN KEY ("tallaId") REFERENCES "Talla"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenciaEje" ADD CONSTRAINT "ReferenciaEje_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "Referencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenciaEje" ADD CONSTRAINT "ReferenciaEje_grupoOpcionId_fkey" FOREIGN KEY ("grupoOpcionId") REFERENCES "GrupoOpcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenciaMarca" ADD CONSTRAINT "ReferenciaMarca_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "Referencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenciaMarca" ADD CONSTRAINT "ReferenciaMarca_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoConfigurado" ADD CONSTRAINT "ProductoConfigurado_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "Referencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoConfigurado" ADD CONSTRAINT "ProductoConfigurado_marcaId_fkey" FOREIGN KEY ("marcaId") REFERENCES "Marca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoConfiguradoOpcion" ADD CONSTRAINT "ProductoConfiguradoOpcion_productoConfiguradoId_fkey" FOREIGN KEY ("productoConfiguradoId") REFERENCES "ProductoConfigurado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoConfiguradoOpcion" ADD CONSTRAINT "ProductoConfiguradoOpcion_opcionId_fkey" FOREIGN KEY ("opcionId") REFERENCES "Opcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
