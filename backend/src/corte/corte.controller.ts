import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EstadoOrdenCorte } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CorteService } from './corte.service';
import { CrearOrdenCorteDto } from './dto/crear-orden-corte.dto';
import { AvanzarOrdenCorteDto } from './dto/avanzar-orden-corte.dto';
import { RegistrarAvanceDto } from './dto/registrar-avance.dto';

/** Los que pueden cargar una orden de corte. Espejo de `ROLES_PROGRAMAN_CORTE` del front. */
export const ROLES_PROGRAMAN_CORTE = ['ADMIN', 'GERENTE', 'JEFE_CORTE'];

@UseGuards(JwtAuthGuard)
@Controller('corte')
export class CorteController {
  constructor(private readonly service: CorteService) {}

  @Get('tablero')
  tablero(
    @Query('lineaId') lineaId?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.tablero({ lineaId: lineaId ? Number(lineaId) : undefined, desde, hasta });
  }

  @Get('ordenes')
  listar(
    @Query('lineaId') lineaId?: string,
    @Query('estado') estado?: EstadoOrdenCorte,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.service.listar({
      lineaId: lineaId ? Number(lineaId) : undefined,
      estado,
      desde,
      hasta,
    });
  }

  @Get('ordenes/:id')
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.service.obtener(id);
  }

  // Quién programa el corte del día: la gerencia y el jefe de corte. El resto de
  // roles sigue viendo el tablero, pero no carga órdenes.
  @Get('ofs-disponibles')
  @UseGuards(RolesGuard)
  @Roles(...ROLES_PROGRAMAN_CORTE)
  ofsDisponibles() {
    return this.service.ofsDisponibles();
  }

  @Post('ordenes')
  @UseGuards(RolesGuard)
  @Roles(...ROLES_PROGRAMAN_CORTE)
  crear(@Body() dto: CrearOrdenCorteDto) {
    return this.service.crear(dto);
  }

  @Patch('ordenes/:id/estado')
  avanzar(@Param('id', ParseIntPipe) id: number, @Body() dto: AvanzarOrdenCorteDto) {
    return this.service.avanzar(id, dto);
  }

  @Post('ordenes/:id/avances')
  registrarAvance(@Param('id', ParseIntPipe) id: number, @Body() dto: RegistrarAvanceDto) {
    return this.service.registrarAvance(id, dto);
  }
}
