import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Celula } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OperariosService } from './operarios.service';
import { CrearOperarioDto } from './dto/crear-operario.dto';
import { ActualizarOperarioDto } from './dto/actualizar-operario.dto';

/**
 * ABM de operarios de planta. OJO: un `Operario` NO es un `User` — no tiene
 * login; es la persona que queda registrada en cada escaneo del MES. Por eso
 * tampoco se borra: firma eventos de trazabilidad e incidencias de calidad.
 *
 * `GET /fabricacion/operarios` sigue existiendo para el selector del piso;
 * este listado es el de administración y muestra también a los inactivos.
 */
@UseGuards(JwtAuthGuard)
@Controller('operarios')
export class OperariosController {
  constructor(private readonly operarios: OperariosService) {}

  @Get() listar(
    @Query('celula', new ParseEnumPipe(Celula, { optional: true }))
    celula?: Celula,
    @Query('soloActivos', new ParseBoolPipe({ optional: true }))
    soloActivos?: boolean,
  ) {
    return this.operarios.listar({ celula, soloActivos });
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearOperarioDto) {
    return this.operarios.crear(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarOperarioDto,
  ) {
    return this.operarios.actualizar(id, dto);
  }
}
