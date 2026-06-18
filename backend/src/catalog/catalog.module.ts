import { Module } from '@nestjs/common';
import { BomController } from './bom/bom.controller';
import { BomLoaderService } from './bom/bom-loader.service';
import { BomVersionService } from './bom/bom-version.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { MarcaController } from './marca/marca.controller';
import { MarcaService } from './marca/marca.service';
import { MaterialController } from './material/material.controller';
import { MaterialService } from './material/material.service';
import { ReferenciaController } from './referencia/referencia.controller';
import { ReferenciaAbmService } from './referencia/referencia.service';
import { GrupoOpcionController } from './grupo-opcion/grupo-opcion.controller';
import { GrupoOpcionService } from './grupo-opcion/grupo-opcion.service';
import { ProductoConfiguradoController } from './producto-configurado/producto-configurado.controller';
import { ProductoConfiguradoService } from './producto-configurado/producto-configurado.service';

@Module({
  controllers: [
    BomController,
    CatalogController,
    MarcaController,
    MaterialController,
    ReferenciaController,
    GrupoOpcionController,
    ProductoConfiguradoController,
  ],
  providers: [
    BomLoaderService,
    BomVersionService,
    CatalogService,
    MarcaService,
    MaterialService,
    ReferenciaAbmService,
    GrupoOpcionService,
    ProductoConfiguradoService,
  ],
  exports: [BomLoaderService, BomVersionService],
})
export class CatalogModule {}
