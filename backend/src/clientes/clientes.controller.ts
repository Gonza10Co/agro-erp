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
import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';
import { ActualizarClienteDto } from './dto/actualizar-cliente.dto';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  // Gestión comercial: solo roles internos. El CLIENTE crea pedidos, no clientes.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearClienteDto) {
    return this.clientes.crear(dto);
  }
  @Get() listar() {
    return this.clientes.listar();
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.clientes.obtener(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.clientes.actualizar(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.clientes.desactivar(id);
  }
}
