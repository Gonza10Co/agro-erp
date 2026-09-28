import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InventarioService } from './inventario.service';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';
import { MovimientoMaterialDto } from './dto/movimiento-material.dto';
import { AjustePtDto } from './dto/ajuste-pt.dto';
import { AjusteMpDto } from './dto/ajuste-mp.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('inventario')
export class InventarioController {
  constructor(private readonly inventario: InventarioService) {}

  @Post('bodegas') crearBodega(@Body() dto: CrearBodegaDto) {
    return this.inventario.crearBodega(dto);
  }
  @Post('pt') registrarStock(@Body() dto: RegistrarStockDto) {
    return this.inventario.registrarStock(dto);
  }

  // Carga y ajuste del inventario de producto terminado por conteo físico.
  // Solo quien responde por el inventario fija saldos: gerencia o administración.
  @Get('pt/plantilla') plantillaAjustePt() {
    return this.inventario.plantillaAjustePt();
  }
  @Post('pt/ajuste/previsualizar') previsualizarAjustePt(@Body() dto: AjustePtDto) {
    return this.inventario.previsualizarAjustePt(dto);
  }
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post('pt/ajuste') aplicarAjustePt(@Body() dto: AjustePtDto, @Req() req: any) {
    return this.inventario.aplicarAjustePt(dto, req.user);
  }

  // Carga y ajuste del inventario de materia prima por conteo físico. Mismas
  // reglas que el de botas: cualquiera revisa, solo gerencia o administración aplica.
  @Get('material/plantilla') plantillaAjusteMp() {
    return this.inventario.plantillaAjusteMp();
  }
  @Post('material/ajuste/previsualizar') previsualizarAjusteMp(@Body() dto: AjusteMpDto) {
    return this.inventario.previsualizarAjusteMp(dto);
  }
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post('material/ajuste') aplicarAjusteMp(@Body() dto: AjusteMpDto, @Req() req: any) {
    return this.inventario.aplicarAjusteMp(dto, req.user);
  }

  @Get('consolidado') consolidado(
    @Query('lineaId', new ParseIntPipe({ optional: true })) lineaId?: number,
  ) {
    return this.inventario.consolidado(lineaId);
  }

  @Get('movimientos') movimientos(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.inventario.kardex(limit);
  }

  @Post('material/movimiento') movimientoMaterial(
    @Body() dto: MovimientoMaterialDto,
    @Req() req: any,
  ) {
    return this.inventario.movimientoMaterial(dto, req.user);
  }
}
