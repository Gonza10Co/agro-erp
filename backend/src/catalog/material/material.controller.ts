import {
  Body,
  Controller,
  Delete,
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
import { MaterialService } from './material.service';
import { CrearMaterialDto } from './dto/crear-material.dto';
import { ActualizarMaterialDto } from './dto/actualizar-material.dto';
import { CrearAliasDto } from './dto/crear-alias.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/materiales')
export class MaterialController {
  constructor(private readonly materiales: MaterialService) {}

  // Lectura: cualquier usuario autenticado (lo consume el editor de BOM).
  @Get() listar() {
    return this.materiales.listar();
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.materiales.obtener(id);
  }

  // Escrituras: solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearMaterialDto) {
    return this.materiales.crear(dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarMaterialDto,
  ) {
    return this.materiales.actualizar(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.materiales.desactivar(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post(':id/alias') agregarAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CrearAliasDto,
  ) {
    return this.materiales.agregarAlias(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Delete('alias/:aliasId') quitarAlias(
    @Param('aliasId', ParseIntPipe) aliasId: number,
  ) {
    return this.materiales.quitarAlias(aliasId);
  }
}
