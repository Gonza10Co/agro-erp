import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BomLoaderService } from './bom-loader.service';
import { BomVersionService } from './bom-version.service';
import { resolverBom } from './bom-resolver';
import { enriquecer, idsDeResuelto } from './bom-enriquecer';
import { ResolverBomDto } from './dto/resolver-bom.dto';
import { CrearBomVersionDto } from './dto/crear-bom-version.dto';
import { CatalogService } from '../catalog.service';

@UseGuards(JwtAuthGuard)
@Controller('catalog/bom')
export class BomController {
  constructor(
    private readonly loader: BomLoaderService,
    private readonly version: BomVersionService,
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

  // Crear una nueva versión del BOM (desactiva la vigente). Solo roles internos.
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'GERENTE')
  @Post('version')
  crearVersion(@Body() dto: CrearBomVersionDto) {
    return this.version.crearNuevaVersion(dto);
  }

  // Histórico de versiones de una referencia (la activa primero).
  @Get(':referenciaId/versiones')
  versiones(@Param('referenciaId', ParseIntPipe) referenciaId: number) {
    return this.version.listarVersiones(referenciaId);
  }
}
