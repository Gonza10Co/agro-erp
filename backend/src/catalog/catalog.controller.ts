import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('productos')
  productos() {
    return this.catalog.listarProductos();
  }

  @Get('tallas')
  tallas() {
    return this.catalog.listarTallas();
  }
}
