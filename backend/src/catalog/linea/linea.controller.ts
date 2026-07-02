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
import { LineaService } from './linea.service';
import { CrearLineaDto } from './dto/crear-linea.dto';
import { ActualizarLineaDto } from './dto/actualizar-linea.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/lineas')
export class LineaController {
  constructor(private readonly lineas: LineaService) {}

  @Get() listar() {
    return this.lineas.listar();
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.lineas.obtener(id);
  }
  // Gestión del catálogo: solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearLineaDto) {
    return this.lineas.crear(dto);
  }
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarLineaDto,
  ) {
    return this.lineas.actualizar(id, dto);
  }
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.lineas.desactivar(id);
  }
}
