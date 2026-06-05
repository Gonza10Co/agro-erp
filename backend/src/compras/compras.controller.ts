import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ComprasService } from './compras.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ComprasController {
  constructor(private readonly service: ComprasService) {}

  @Post('ops/:id/requerimiento')
  calcular(@Param('id', ParseIntPipe) id: number) {
    return this.service.calcularRequerimiento(id);
  }

  @Get('requerimientos/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }

  @Get('requerimientos')
  listar(@Query('opId', ParseIntPipe) opId: number) {
    return this.service.listarPorOp(opId);
  }

  @Get('proveedores')
  proveedores() {
    return this.service.listarProveedores();
  }

  @Get('inventario-material')
  inventarioMaterial() {
    return this.service.listarInventarioMaterial();
  }
}
