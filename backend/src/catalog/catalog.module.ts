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

@Module({
  controllers: [
    BomController,
    CatalogController,
    MarcaController,
    MaterialController,
    ReferenciaController,
    GrupoOpcionController,
  ],
  providers: [
    BomLoaderService,
    BomVersionService,
    CatalogService,
    MarcaService,
    MaterialService,
    ReferenciaAbmService,
    GrupoOpcionService,
  ],
  exports: [BomLoaderService, BomVersionService],
})
export class CatalogModule {}
