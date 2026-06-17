import { Module } from '@nestjs/common';
import { BomController } from './bom/bom.controller';
import { BomLoaderService } from './bom/bom-loader.service';
import { BomVersionService } from './bom/bom-version.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [BomController, CatalogController],
  providers: [BomLoaderService, BomVersionService, CatalogService],
  exports: [BomLoaderService, BomVersionService],
})
export class CatalogModule {}
