import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SedesService } from './sedes.service';
import { CrearSedeDto } from './dto/crear-sede.dto';
import { ActualizarSedeDto } from './dto/actualizar-sede.dto';

// Sedes de entrega de un cliente. Mismo criterio de roles que el ABM de clientes:
// es gestión comercial, así que el CLIENTE (fábrica) también la administra.
@UseGuards(JwtAuthGuard)
@Controller('clientes/:clienteId/sedes')
export class SedesController {
  constructor(private readonly sedes: SedesService) {}

  @Get() listar(@Param('clienteId', ParseIntPipe) clienteId: number) {
    return this.sedes.listar(clienteId);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Post() crear(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Body() dto: CrearSedeDto,
  ) {
    return this.sedes.crear(clienteId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Patch(':id') actualizar(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarSedeDto,
  ) {
    return this.sedes.actualizar(clienteId, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE', 'CLIENTE')
  @Patch(':id/desactivar') desactivar(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sedes.desactivar(clienteId, id);
  }
}
