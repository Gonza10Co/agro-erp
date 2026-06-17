import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearMaterialDto } from './dto/crear-material.dto';
import { ActualizarMaterialDto } from './dto/actualizar-material.dto';
import { CrearAliasDto } from './dto/crear-alias.dto';

@Injectable()
export class MaterialService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearMaterialDto) {
    const existe = await this.prisma.material.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(`Ya existe un material con código ${dto.codigo}`);
    return this.prisma.material.create({
      data: {
        codigo: dto.codigo,
        nombreCanonico: dto.nombreCanonico,
        categoriaId: dto.categoriaId,
        unidadMedidaId: dto.unidadMedidaId,
        origen: dto.origen,
        claseBom: dto.claseBom,
        proveedorId: dto.proveedorId,
      },
    });
  }

  // Mismo shape que CatalogService.listarMateriales (lo consume el editor de BOM).
  async listar() {
    const filas = await this.prisma.material.findMany({
      where: { activo: true },
      orderBy: { nombreCanonico: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombreCanonico: true,
        origen: true,
        unidadMedida: { select: { codigo: true } },
      },
    });
    return filas.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      nombreCanonico: m.nombreCanonico,
      origen: m.origen,
      unidad: m.unidadMedida?.codigo ?? '',
    }));
  }

  obtener(id: number) {
    return this.prisma.material.findUnique({
      where: { id },
      include: { alias: true },
    });
  }

  async actualizar(id: number, dto: ActualizarMaterialDto) {
    const existe = await this.prisma.material.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`Material ${id} no encontrado`);
    return this.prisma.material.update({
      where: { id },
      data: {
        nombreCanonico: dto.nombreCanonico,
        categoriaId: dto.categoriaId,
        unidadMedidaId: dto.unidadMedidaId,
        origen: dto.origen,
        claseBom: dto.claseBom,
        proveedorId: dto.proveedorId,
      },
    });
  }

  async desactivar(id: number) {
    const existe = await this.prisma.material.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`Material ${id} no encontrado`);
    return this.prisma.material.update({
      where: { id },
      data: { activo: false },
    });
  }

  async agregarAlias(materialId: number, dto: CrearAliasDto) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
    });
    if (!material)
      throw new NotFoundException(`Material ${materialId} no encontrado`);
    const existe = await this.prisma.materialAlias.findUnique({
      where: {
        materialId_textoLegacy: { materialId, textoLegacy: dto.textoLegacy },
      },
    });
    if (existe)
      throw new ConflictException(
        `El material ${materialId} ya tiene el alias "${dto.textoLegacy}"`,
      );
    return this.prisma.materialAlias.create({
      data: { materialId, textoLegacy: dto.textoLegacy },
    });
  }

  async quitarAlias(aliasId: number) {
    const existe = await this.prisma.materialAlias.findUnique({
      where: { id: aliasId },
    });
    if (!existe) throw new NotFoundException(`Alias ${aliasId} no encontrado`);
    return this.prisma.materialAlias.delete({ where: { id: aliasId } });
  }
}
