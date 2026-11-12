import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ProyeccionService } from './proyeccion.service';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/proyeccion')
export class ProyeccionController {
  constructor(private readonly service: ProyeccionService) {}

  /** Pedidos vivos contra la capacidad de la planta. Solo lectura. */
  @Get() proyectar() {
    return this.service.proyectar();
  }
}
