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
import { PiezaService } from './pieza.service';
import { CrearPiezaDto } from './dto/crear-pieza.dto';
import { ActualizarPiezaDto } from './dto/actualizar-pieza.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/piezas')
export class PiezaController {
  constructor(private readonly piezas: PiezaService) {}

  @Get() listar() {
    return this.piezas.listar();
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
}
