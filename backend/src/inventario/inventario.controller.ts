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

  @Get('consolidado') consolidado() {
    return this.inventario.consolidado();
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
