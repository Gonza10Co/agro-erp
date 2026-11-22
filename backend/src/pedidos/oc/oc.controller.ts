import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OcService } from './oc.service';
import { OcCosteoService } from './oc-costeo.service';
import { CrearOCDto } from './dto/crear-oc.dto';
import { ActualizarOCDto } from './dto/actualizar-oc.dto';
import { CambiarFechaEntregaDto } from './dto/cambiar-fecha-entrega.dto';
import { CambiarFechaPedidoClienteDto } from './dto/cambiar-fecha-pedido-cliente.dto';

@UseGuards(JwtAuthGuard)
@Controller('pedidos/oc')
export class OcController {
  constructor(
    private readonly oc: OcService,
    private readonly costeo: OcCosteoService,
  ) {}

  @Post() crear(@Body() dto: CrearOCDto) {
    return this.oc.crear(dto);
  }
  @Get() listar() {
    return this.oc.listar();
  }
  // Va antes de ':id' para que 'export' no caiga en el ParseIntPipe.
  @Get('export') exportar() {
    return this.oc.exportar();
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.oc.obtener(id);
  }
  @Get(':id/costeo') costear(@Param('id', ParseIntPipe) id: number) {
    return this.costeo.costear(id);
  }
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarOCDto,
  ) {
    return this.oc.actualizar(id, dto);
  }
  @Patch(':id/fecha-entrega') cambiarFechaEntrega(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarFechaEntregaDto,
  ) {
    return this.oc.cambiarFechaEntrega(id, dto.fechaEntrega);
  }
  @Patch(':id/fecha-pedido-cliente') cambiarFechaPedidoCliente(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarFechaPedidoClienteDto,
  ) {
    return this.oc.cambiarFechaPedidoCliente(id, dto.fechaPedidoCliente);
  }
  @Post(':id/confirmar') confirmar(@Param('id', ParseIntPipe) id: number) {
    return this.oc.confirmar(id);
  }
  /** Deshace la confirmación si nada arrancó en planta (mismos permisos que confirmar). */
  @Post(':id/unconfirm') unconfirm(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.oc.unconfirm(id, req.user?.sub ?? null);
  }
  @Delete(':id') eliminar(@Param('id', ParseIntPipe) id: number) {
    return this.oc.eliminar(id);
  }
}
