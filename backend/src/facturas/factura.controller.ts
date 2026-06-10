import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FacturaService } from './factura.service';
import { FacturarDto } from './dto/facturar.dto';

@UseGuards(JwtAuthGuard)
@Controller('facturas')
export class FacturaController {
  constructor(private readonly service: FacturaService) {}

  @Post()
  crear(@Body() dto: FacturarDto) {
    return this.service.facturar(dto);
  }

  @Get()
  listar() {
    return this.service.listar();
  }

  @Get(':id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }
}
