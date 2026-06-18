import { Body, Controller, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProductoConfiguradoService } from './producto-configurado.service';
import { CrearProductoDto } from './dto/crear-producto.dto';

// El GET /catalog/productos (listado) vive en CatalogController. Aquí solo escritura.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'GERENTE')
@Controller('catalog/productos')
export class ProductoConfiguradoController {
  constructor(private readonly productos: ProductoConfiguradoService) {}

  @Post() crear(@Body() dto: CrearProductoDto) {
    return this.productos.crear(dto);
  }

  @Patch(':id/desactivar') desactivar(@Param('id', ParseIntPipe) id: number) {
    return this.productos.desactivar(id);
  }
}
