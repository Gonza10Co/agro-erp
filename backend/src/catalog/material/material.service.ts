import {
  BadRequestException,
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

  categorias() {
    return this.prisma.categoriaMaterial.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } });
  }

  unidades() {
    return this.prisma.unidadMedida.findMany({ select: { id: true, codigo: true, nombre: true }, orderBy: { codigo: 'asc' } });
  }

  async crear(dto: CrearMaterialDto) {
    const existe = await this.prisma.material.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(`Ya existe un material con código ${dto.codigo}`);
    // Sin esto, un id inexistente reventaba como 500 por la llave foránea.
    const [categoria, unidad] = await Promise.all([
      this.prisma.categoriaMaterial.findUnique({ where: { id: dto.categoriaId } }),
      this.prisma.unidadMedida.findUnique({ where: { id: dto.unidadMedidaId } }),
    ]);
    if (!categoria) throw new BadRequestException('La categoría elegida no existe');
    if (!unidad) throw new BadRequestException('La unidad de medida elegida no existe');
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

  // Mismo shape que CatalogService.listarMateriales (lo consume el editor de BOM),
  // más `activo`. Solo activos salvo `incluirInactivas` (pantalla de maestros).
  async listar(incluirInactivas = false) {
    const filas = await this.prisma.material.findMany({
      where: incluirInactivas ? {} : { activo: true },
      orderBy: { nombreCanonico: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombreCanonico: true,
        origen: true,
        activo: true,
        unidadMedida: { select: { codigo: true } },
      },
    });
    return filas.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      nombreCanonico: m.nombreCanonico,
      origen: m.origen,
      activo: m.activo,
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

  async reactivar(id: number) {
    const existe = await this.prisma.material.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`Material ${id} no encontrado`);
    return this.prisma.material.update({
      where: { id },
      data: { activo: true },
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
