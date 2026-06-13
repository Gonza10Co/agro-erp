import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ComprasService } from './compras.service';
import { ComprasProveedorService } from './compras-proveedor.service';
import { RegistrarRecepcionDto } from './dto/registrar-recepcion.dto';
import { RegistrarDevolucionDto } from './dto/registrar-devolucion.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ComprasController {
  constructor(
    private readonly service: ComprasService,
    private readonly proveedorService: ComprasProveedorService,
  ) {}

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

  // ── Demo 13: OCP a proveedor ──

  @Post('requerimientos/:id/ordenes')
  generarOrdenes(@Param('id', ParseIntPipe) id: number) {
    return this.proveedorService.generarDesdeRequerimiento(id);
  }

  @Get('compras/ordenes')
  listarOrdenes() {
    return this.proveedorService.listar();
  }

  @Get('compras/ordenes/:id')
  obtenerOrden(@Param('id', ParseIntPipe) id: number) {
    return this.proveedorService.obtener(id);
  }

  @Post('compras/ordenes/:id/recepciones')
  registrarRecepcion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarRecepcionDto,
    @Req() req: any,
  ) {
    return this.proveedorService.registrarRecepcion(id, dto, req.user);
  }

  @Post('compras/ordenes/:id/devoluciones')
  registrarDevolucion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegistrarDevolucionDto,
    @Req() req: any,
  ) {
    return this.proveedorService.registrarDevolucion(id, dto, req.user);
  }
}
