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
import { ProveedoresService } from './proveedores.service';
import { CrearProveedorDto } from './dto/crear-proveedor.dto';
import { ActualizarProveedorDto } from './dto/actualizar-proveedor.dto';

@UseGuards(JwtAuthGuard)
@Controller('proveedores')
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get() listar() {
    return this.proveedores.listar();
  }
  @Get(':id') obtener(@Param('id', ParseIntPipe) id: number) {
    return this.proveedores.obtener(id);
  }

  // Gestión comercial: solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post() crear(@Body() dto: CrearProveedorDto) {
    return this.proveedores.crear(dto);
  }
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id') actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarProveedorDto,
  ) {
    return this.proveedores.actualizar(id, dto);
  }
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.proveedores.desactivar(id);
  }
}
