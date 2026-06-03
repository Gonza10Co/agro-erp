import { Module } from '@nestjs/common';
import { BomController } from './bom/bom.controller';
import { BomLoaderService } from './bom/bom-loader.service';

@Module({
  controllers: [BomController],
  providers: [BomLoaderService],
})
export class CatalogModule {}
