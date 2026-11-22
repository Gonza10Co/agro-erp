import { Module } from '@nestjs/common';
import { ProyeccionController } from './proyeccion.controller';
import { ProyeccionService } from './proyeccion.service';
import { DeliveryEstimateController } from './delivery-estimate.controller';

@Module({
  controllers: [ProyeccionController, DeliveryEstimateController],
  providers: [ProyeccionService],
})
export class ProyeccionModule {}
