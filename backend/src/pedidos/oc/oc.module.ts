import { Module } from '@nestjs/common';
import { CatalogModule } from '../../catalog/catalog.module';
import { OcController } from './oc.controller';
import { OcService } from './oc.service';
import { OcCosteoService } from './oc-costeo.service';

@Module({
  imports: [CatalogModule],
  controllers: [OcController],
  providers: [OcService, OcCosteoService],
  exports: [OcService],
})
export class OcModule {}
