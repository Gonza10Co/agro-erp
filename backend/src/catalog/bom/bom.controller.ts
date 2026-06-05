import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BomLoaderService } from './bom-loader.service';
import { resolverBom } from './bom-resolver';
import { enriquecer, idsDeResuelto } from './bom-enriquecer';
import { ResolverBomDto } from './dto/resolver-bom.dto';
import { CatalogService } from '../catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('catalog/bom')
export class BomController {
  constructor(
    private readonly loader: BomLoaderService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('resolve')
  async resolve(@Query() dto: ResolverBomDto) {
    const entrada = await this.loader.cargarEntrada({
      referenciaId: dto.referenciaId,
      marcaId: dto.marcaId ?? null,
      opcionIds: dto.opcionIds ?? [],
      talla: dto.talla,
    });
    const resuelto = resolverBom(entrada);
    const meta = await this.catalog.metaMateriales(idsDeResuelto(resuelto));
    return enriquecer(resuelto, meta);
  }
}
