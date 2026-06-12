import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ComprasController } from './compras.controller';
import { ComprasService } from './compras.service';
import { ComprasProveedorService } from './compras-proveedor.service';

@Module({
  imports: [CatalogModule],
  controllers: [ComprasController],
  providers: [ComprasService, ComprasProveedorService],
})
export class ComprasModule {}
