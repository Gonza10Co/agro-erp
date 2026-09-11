import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { CalidadModule } from '../calidad/calidad.module';
import { FabricacionController } from './fabricacion.controller';
import { FabricacionService } from './fabricacion.service';

@Module({
  // CatalogModule trae el BomLoaderService: el consumo teórico de la OF sale de
  // resolver el mismo BOM que alimenta el requerimiento de compra.
  // CalidadModule: el pistolazo con daño reusa sellar segunda / dar de baja.
  imports: [CatalogModule, CalidadModule],
  controllers: [FabricacionController],
  providers: [FabricacionService],
  // El panel gerencial lee el mismo resumen que el tablero: una sola fuente para
  // los números de planta, o las dos pantallas terminan contradiciéndose.
  exports: [FabricacionService],
})
export class FabricacionModule {}
