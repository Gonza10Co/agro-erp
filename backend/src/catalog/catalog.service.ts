import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetaMaterial } from './bom/bom-enriquecer';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listarProductos() {
    return this.prisma.productoConfigurado.findMany({
      where: { activo: true },
      orderBy: { nombreComercial: 'asc' },
      select: {
        id: true,
        codigo: true,
        nombreComercial: true,
        marca: { select: { id: true, nombre: true } },
        referencia: {
          select: {
            id: true,
            codigo: true,
            tallaMin: { select: { id: true, valor: true, orden: true } },
            tallaMax: { select: { id: true, valor: true, orden: true } },
          },
        },
      },
    });
  }

  listarTallas() {
    return this.prisma.talla.findMany({ orderBy: { orden: 'asc' } });
  }

  // Materiales activos para selectores (editor de BOM, ABM). Incluye el código de unidad.
  async listarMateriales() {
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

  listarReferencias() {
    return this.prisma.referencia.findMany({
      where: { activo: true },
      orderBy: { codigo: 'asc' },
      select: { id: true, codigo: true, nombreInterno: true },
    });
  }

  async metaMateriales(ids: number[]): Promise<Record<number, MetaMaterial>> {
    if (!ids.length) return {};
    const filas = await this.prisma.material.findMany({
      where: { id: { in: ids } },
      select: { id: true, codigo: true, nombreCanonico: true, unidadMedida: { select: { codigo: true } }, categoria: { select: { nombre: true } } },
    });
    const map: Record<number, MetaMaterial> = {};
    for (const m of filas) map[m.id] = { codigo: m.codigo, nombre: m.nombreCanonico, unidad: m.unidadMedida?.codigo ?? '', categoria: m.categoria?.nombre ?? '' };
    return map;
  }

  async configReferencia(id: number) {
    const ref = await this.prisma.referencia.findFirst({
      where: { id, activo: true },
      select: {
        id: true,
        codigo: true,
        nombreInterno: true,
        tallaMin: { select: { valor: true } },
        tallaMax: { select: { valor: true } },
        marcas: { select: { marcaId: true } },
        ejes: {
          select: {
            obligatorio: true,
            grupoOpcion: {
              select: {
                id: true,
                codigo: true,
                nombre: true,
                orden: true,
                opciones: { where: { activo: true }, select: { id: true, codigo: true, nombre: true } },
              },
            },
          },
        },
      },
    });
    if (!ref) throw new NotFoundException(`Referencia ${id} no encontrada`);
    // Cualquier referencia se vende con cualquier marca (JP, 2026-09-28): se ofrecen
    // todas las activas. Las asignadas a la referencia (ReferenciaMarca) van primero.
    const habituales = new Set(ref.marcas.map((m) => m.marcaId));
    const marcas = (
      await this.prisma.marca.findMany({
        where: { activo: true },
        select: { id: true, codigo: true, nombre: true, tipo: true },
        orderBy: { nombre: 'asc' },
      })
    ).sort((a, b) => Number(habituales.has(b.id)) - Number(habituales.has(a.id)));
    return {
      referencia: {
        id: ref.id,
        codigo: ref.codigo,
        nombreInterno: ref.nombreInterno,
        tallaMin: ref.tallaMin.valor,
        tallaMax: ref.tallaMax.valor,
      },
      marcas,
      ejes: ref.ejes
        .slice()
        .sort((a, b) => a.grupoOpcion.orden - b.grupoOpcion.orden)
        .map((e) => ({
          grupo: { id: e.grupoOpcion.id, codigo: e.grupoOpcion.codigo, nombre: e.grupoOpcion.nombre, obligatorio: e.obligatorio },
          opciones: e.grupoOpcion.opciones,
        })),
    };
  }
}
