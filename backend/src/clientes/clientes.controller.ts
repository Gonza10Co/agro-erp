import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ClientesService } from './clientes.service';
import { CrearClienteDto } from './dto/crear-cliente.dto';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Post() crear(@Body() dto: CrearClienteDto) { return this.clientes.crear(dto); }
  @Get() listar() { return this.clientes.listar(); }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) { return this.clientes.obtener(id); }
}
