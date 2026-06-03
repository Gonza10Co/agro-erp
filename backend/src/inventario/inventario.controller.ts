import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { InventarioService } from './inventario.service';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';

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
}
