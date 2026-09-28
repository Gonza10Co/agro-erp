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
import { MarcaService } from './marca.service';
import { CrearMarcaDto } from './dto/crear-marca.dto';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/marcas')
export class MarcaController {
  constructor(private readonly marcas: MarcaService) {}

  // Solo activas por defecto (selects, BOM, wizard de OC); `?incluirInactivas=true`
  // es opt-in para la pantalla de maestros, que necesita verlas para reactivarlas.
  @Get() listar(
    @Query('incluirInactivas', new ParseBoolPipe({ optional: true }))
    incluirInactivas?: boolean,
  ) {
    return this.marcas.listar(incluirInactivas);
  }

  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.marcas.obtener(id);
  }

  // Gestión del catálogo: solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearMarcaDto) {
    return this.marcas.crear(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarMarcaDto,
  ) {
    return this.marcas.actualizar(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.marcas.desactivar(id);
  }

  // Deshace un desactivar (clic accidental); mismos roles que desactivar.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/reactivar') reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.marcas.reactivar(id);
  }
}
