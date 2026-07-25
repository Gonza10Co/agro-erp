import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { FacturaService } from './factura.service';
import { FacturarDto } from './dto/facturar.dto';
import { FacturarServicioDto } from './dto/facturar-servicio.dto';

@UseGuards(JwtAuthGuard)
@Controller('facturas')
export class FacturaController {
  constructor(private readonly service: FacturaService) {}

  @Post()
  crear(@Body() dto: FacturarDto) {
    return this.service.facturar(dto);
  }

  // Antes de ':id' a propósito: si no, 'servicio' entraría por el ParseIntPipe.
  @Post('servicio')
  crearServicio(@Body() dto: FacturarServicioDto) {
    return this.service.facturarServicio(dto);
  }

  // Catálogo de servicios facturables (inyección a terceros, mantenimiento…).
  @Get('servicio/catalogo')
  catalogoServicios() {
    return this.service.listarServicios();
  }

  @Get('servicio/sugerencia')
  sugerencia(
    @Query('lineaId', ParseIntPipe) lineaId: number,
    @Query('anio', ParseIntPipe) anio: number,
    @Query('mes', ParseIntPipe) mes: number,
  ) {
    return this.service.sugerenciaServicio(lineaId, anio, mes);
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
