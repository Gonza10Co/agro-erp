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

  @Get() listar() {
    return this.marcas.listar();
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
}
