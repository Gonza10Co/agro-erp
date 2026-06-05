import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';

@Module({
  imports: [CatalogModule],
  controllers: [ComprasController],
  providers: [ComprasService],
})
export class ComprasModule {}
