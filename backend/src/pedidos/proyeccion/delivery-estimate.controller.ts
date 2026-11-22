import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProyeccionService } from './proyeccion.service';
import { DeliveryEstimateDto } from './dto/delivery-estimate.dto';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class DeliveryEstimateController {
  constructor(private readonly service: ProyeccionService) {}

  /** Fecha de entrega sugerida para el pedido que se está montando. Solo lectura. */
  @Post('delivery-estimate') @HttpCode(200) estimate(@Body() dto: DeliveryEstimateDto) {
    return this.service.estimarEntrega(dto);
  }
}
