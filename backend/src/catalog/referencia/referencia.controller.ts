import {
  Body,
  Controller,
  Delete,
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
import { ReferenciaAbmService } from './referencia.service';
import { CrearReferenciaDto } from './dto/crear-referencia.dto';
import { ActualizarReferenciaDto } from './dto/actualizar-referencia.dto';
import { AsignarMarcaDto } from './dto/asignar-marca.dto';
import { AsignarEjeDto } from './dto/asignar-eje.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/referencias-abm')
export class ReferenciaController {
  constructor(private readonly referencias: ReferenciaAbmService) {}

  // Lectura: cualquier usuario autenticado.
  // Solo activas por defecto (selects, BOM, wizard de OC); `?incluirInactivas=true`
  // es opt-in para la pantalla de maestros, que necesita verlas para reactivarlas.
  @Get() listar(
    @Query('incluirInactivas', new ParseBoolPipe({ optional: true }))
    incluirInactivas?: boolean,
  ) {
    return this.referencias.listar(incluirInactivas);
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.referencias.obtener(id);
  }

  // Escritura: solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearReferenciaDto) {
    return this.referencias.crear(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarReferenciaDto,
  ) {
    return this.referencias.actualizar(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.referencias.desactivar(id);
  }

  // Deshace un desactivar (clic accidental); mismos roles que desactivar.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/reactivar') reactivar(@Param('id', ParseIntPipe) id: number) {
    return this.referencias.reactivar(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post(':id/marcas') asignarMarca(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarMarcaDto,
  ) {
    return this.referencias.asignarMarca(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Delete('marcas/:refMarcaId') quitarMarca(
    @Param('refMarcaId', ParseIntPipe) refMarcaId: number,
  ) {
    return this.referencias.quitarMarca(refMarcaId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post(':id/ejes') asignarEje(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AsignarEjeDto,
  ) {
    return this.referencias.asignarEje(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Delete('ejes/:refEjeId') quitarEje(
    @Param('refEjeId', ParseIntPipe) refEjeId: number,
  ) {
    return this.referencias.quitarEje(refEjeId);
  }
}
