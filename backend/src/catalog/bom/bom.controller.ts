import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BomLoaderService } from './bom-loader.service';
import { resolverBom } from './bom-resolver';
import { ResolverBomDto } from './dto/resolver-bom.dto';

@UseGuards(JwtAuthGuard)
@Controller('catalog/bom')
export class BomController {
  constructor(private readonly loader: BomLoaderService) {}

  @Get('resolve')
  async resolve(@Query() dto: ResolverBomDto) {
    const entrada = await this.loader.cargarEntrada({
      referenciaId: dto.referenciaId,
      marcaId: dto.marcaId ?? null,
      opcionIds: dto.opcionIds ?? [],
      talla: dto.talla,
    });
    return resolverBom(entrada);
  }
}
