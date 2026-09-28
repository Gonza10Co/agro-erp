import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CrearMarcaDto } from './dto/crear-marca.dto';
import { ActualizarMarcaDto } from './dto/actualizar-marca.dto';
import { MaterialMarcaDto } from './dto/material-marca.dto';

/** Material con el nombre que se muestra en pantalla. */
const MATERIAL_SELECT = { id: true, codigo: true, nombreCanonico: true } as const;
type MaterialFila = { id: number; codigo: string; nombreCanonico: string };
const mat = (m: MaterialFila) => ({ id: m.id, codigo: m.codigo, nombre: m.nombreCanonico });

@Injectable()
export class MarcaService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(dto: CrearMarcaDto) {
    const existe = await this.prisma.marca.findUnique({
      where: { codigo: dto.codigo },
    });
    if (existe)
      throw new ConflictException(`Ya existe una marca con código ${dto.codigo}`);
    return this.prisma.marca.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        tipo: dto.tipo,
        clienteId: dto.clienteId,
        lineaId: dto.lineaId,
      },
    });
  }

  /** Solo activas salvo `incluirInactivas` (pantalla de maestros, para reactivar). */
  listar(incluirInactivas = false) {
    return this.prisma.marca.findMany({
      where: incluirInactivas ? {} : { activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  obtener(id: number) {
    return this.prisma.marca.findUnique({ where: { id } });
  }

  async actualizar(id: number, dto: ActualizarMarcaDto) {
    const existe = await this.prisma.marca.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la marca con id ${id}`);
    return this.prisma.marca.update({
      where: { id },
      data: {
        nombre: dto.nombre,
        tipo: dto.tipo,
        clienteId: dto.clienteId,
        lineaId: dto.lineaId,
      },
    });
  }

  async desactivar(id: number) {
    const existe = await this.prisma.marca.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la marca con id ${id}`);
    return this.prisma.marca.update({
      where: { id },
      data: { activo: false },
    });
  }

  async reactivar(id: number) {
    const existe = await this.prisma.marca.findUnique({ where: { id } });
    if (!existe) throw new NotFoundException(`No existe la marca con id ${id}`);
    return this.prisma.marca.update({
      where: { id },
      data: { activo: true },
    });
  }

  // ── Materiales propios de la marca ─────────────────────────────────────────
  // Reglas REPLACE globales (referenciaId NULL): se definen UNA vez por marca y el
  // resolvedor de BOM las aplica a todas las referencias cuando el pedido lleva la marca.

  private async exigirMarca(id: number) {
    const marca = await this.prisma.marca.findUnique({ where: { id } });
    if (!marca) throw new NotFoundException(`No existe la marca con id ${id}`);
    return marca;
  }

  private presentarRegla(r: {
    id: number;
    materialObjetivo: MaterialFila | null;
    materialNuevo: MaterialFila | null;
  }) {
    return {
      id: r.id,
      materialObjetivo: r.materialObjetivo ? mat(r.materialObjetivo) : null,
      materialNuevo: r.materialNuevo ? mat(r.materialNuevo) : null,
    };
  }

  async listarMateriales(marcaId: number) {
    await this.exigirMarca(marcaId);
    const reglas = await this.prisma.reglaOverride.findMany({
      where: { marcaId, referenciaId: null, accion: 'REPLACE' },
      include: {
        materialObjetivo: { select: MATERIAL_SELECT },
        materialNuevo: { select: MATERIAL_SELECT },
      },
      orderBy: { id: 'asc' },
    });
    return reglas.map((r) => this.presentarRegla(r));
  }

  async agregarMaterial(marcaId: number, dto: MaterialMarcaDto) {
    const { materialObjetivoId, materialNuevoId } = dto;
    if (materialObjetivoId === materialNuevoId)
      throw new BadRequestException(
        'El material de la marca debe ser distinto al del BOM base',
      );
    await this.exigirMarca(marcaId);

    const materiales = await this.prisma.material.findMany({
      where: { id: { in: [materialObjetivoId, materialNuevoId] } },
      select: { ...MATERIAL_SELECT, activo: true },
    });
    for (const id of [materialObjetivoId, materialNuevoId]) {
      const m = materiales.find((x) => x.id === id);
      if (!m) throw new BadRequestException(`El material ${id} no existe`);
      if (!m.activo)
        throw new BadRequestException(`El material ${m.nombreCanonico} está inactivo`);
    }

    const duplicada = await this.prisma.reglaOverride.findFirst({
      where: { marcaId, referenciaId: null, materialObjetivoId },
      include: { materialNuevo: { select: MATERIAL_SELECT } },
    });
    if (duplicada) {
      const objetivo = materiales.find((x) => x.id === materialObjetivoId)!;
      const destino = duplicada.materialNuevo?.nombreCanonico ?? 'otro material';
      throw new BadRequestException(
        `${objetivo.nombreCanonico} ya se reemplaza por ${destino} en esta marca; quita ese reemplazo primero`,
      );
    }

    // heredaCurva: el material nuevo toma la línea completa del reemplazado (misma
    // clase de consumo, curva por talla / consumo fijo, merma y pieza).
    const regla = await this.prisma.reglaOverride.create({
      data: {
        accion: 'REPLACE',
        marcaId,
        referenciaId: null,
        materialObjetivoId,
        materialNuevoId,
        heredaCurva: true,
      },
      include: {
        materialObjetivo: { select: MATERIAL_SELECT },
        materialNuevo: { select: MATERIAL_SELECT },
      },
    });
    return this.presentarRegla(regla);
  }

  async quitarMaterial(marcaId: number, reglaId: number) {
    // Solo reglas GLOBALES de esta marca: las específicas por referencia no se tocan acá.
    const regla = await this.prisma.reglaOverride.findFirst({
      where: { id: reglaId, marcaId, referenciaId: null },
    });
    if (!regla)
      throw new NotFoundException(
        `No existe el reemplazo ${reglaId} en los materiales de la marca ${marcaId}`,
      );
    await this.prisma.reglaOverride.delete({ where: { id: reglaId } });
    return { id: reglaId };
  }
}
