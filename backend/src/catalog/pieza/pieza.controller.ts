import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PiezaService } from './pieza.service';
import { CrearPiezaDto } from './dto/crear-pieza.dto';
import { ActualizarPiezaDto } from './dto/actualizar-pieza.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/piezas')
export class PiezaController {
  constructor(private readonly piezas: PiezaService) {}

  // Solo activas por defecto (selects, BOM, wizard de OC); `?incluirInactivas=true`
  // es opt-in para la pantalla de maestros, que necesita verlas para reactivarlas.
  @Get() listar(
    @Query('incluirInactivas', new ParseBoolPipe({ optional: true }))
    incluirInactivas?: boolean,
  ) {
    return this.piezas.listar(incluirInactivas);
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.piezas.obtener(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Post() crear(@Body() dto: CrearPiezaDto) {
    return this.piezas.crear(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarPiezaDto,
  ) {
    return this.piezas.actualizar(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.piezas.desactivar(id);
  }

  // Deshace un desactivar (clic accidental); mismos roles que desactivar.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Patch(':id/reactivar') reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.piezas.reactivar(id);
  }
}
