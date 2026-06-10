import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CarteraService } from './cartera.service';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';

@UseGuards(JwtAuthGuard)
@Controller('cartera')
export class CarteraController {
  constructor(private readonly service: CarteraService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post('pagos')
  registrarPago(@Body() dto: RegistrarPagoDto) {
    return this.service.registrarPago(dto);
  }

  @Get('cliente/:id')
  obtenerCliente(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtenerCliente(id);
  }
}
