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
import { GrupoOpcionService } from './grupo-opcion.service';
import { CrearGrupoOpcionDto } from './dto/crear-grupo-opcion.dto';
import { ActualizarGrupoOpcionDto } from './dto/actualizar-grupo-opcion.dto';
import { CrearOpcionDto } from './dto/crear-opcion.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/grupos-opcion')
export class GrupoOpcionController {
  constructor(private readonly grupos: GrupoOpcionService) {}

  // Lectura: cualquier usuario autenticado.
  @Get() listarGrupos() {
    return this.grupos.listarGrupos();
  }

  // Escrituras: solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crearGrupo(@Body() dto: CrearGrupoOpcionDto) {
    return this.grupos.crearGrupo(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizarGrupo(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarGrupoOpcionDto,
  ) {
    return this.grupos.actualizarGrupo(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post(':id/opciones') agregarOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearOpcionDto,
  ) {
    return this.grupos.agregarOpcion(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch('opciones/:opcionId/desactivar') desactivarOpcion(
    @Param('opcionId', ParseIntPipe) opcionId: number,
  ) {
    return this.grupos.desactivarOpcion(opcionId);
  }
}
