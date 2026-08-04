import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FabricacionController } from './fabricacion.controller';
import { FabricacionService } from './fabricacion.service';

@Module({
  // CatalogModule trae el BomLoaderService: el consumo teórico de la OF sale de
  // resolver el mismo BOM que alimenta el requerimiento de compra.
  imports: [CatalogModule],
  controllers: [FabricacionController],
  providers: [FabricacionService],
})
export class FabricacionModule {}
