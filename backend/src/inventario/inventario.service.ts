import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ORDEN_CELULAS } from '../fabricacion/fabricacion-core';
import { validarMovimientoMaterial } from './inventario-core';
import { CrearBodegaDto } from './dto/crear-bodega.dto';
import { RegistrarStockDto } from './dto/registrar-stock.dto';
import { MovimientoMaterialDto } from './dto/movimiento-material.dto';

interface Usuario {
  sub: number;
  role: string;
}

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  crearBodega(dto: CrearBodegaDto) {
    return this.prisma.bodega.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        tipo: dto.tipo,
        prioridad: dto.prioridad,
      },
    });
  }

  registrarStock(dto: RegistrarStockDto) {
    const { productoConfiguradoId, tallaId, bodegaId, cantidad } = dto;
    return this.prisma.inventarioPT.upsert({
      where: {
        productoConfiguradoId_tallaId_bodegaId: {
          productoConfiguradoId,
          tallaId,
          bodegaId,
        },
      },
      create: {
        productoConfiguradoId,
        tallaId,
        bodegaId,
        cantDisponible: cantidad,
      },
      update: { cantDisponible: { increment: cantidad } },
    });
  }

  // Foto única del flujo físico: materia prima → WIP por célula → producto terminado.
  async consolidado() {
    const [materiales, wipPorCelula, pt] = await Promise.all([
      this.prisma.inventarioMaterial.findMany({
        include: {
          material: {
            include: { unidadMedida: { select: { codigo: true } } },
          },
        },
        orderBy: { material: { codigo: 'asc' } },
      }),
      this.prisma.par.groupBy({
        by: ['celulaActual'],
        where: { estado: 'EN_PROCESO' },
        _count: { _all: true },
      }),
      this.prisma.inventarioPT.findMany({
        where: { OR: [{ cantDisponible: { gt: 0 } }, { cantReservada: { gt: 0 } }] },
        include: {
          productoConfigurado: { select: { codigo: true, nombreComercial: true } },
          talla: { select: { valor: true } },
          bodega: { select: { codigo: true, nombre: true } },
        },
        orderBy: [{ productoConfigurado: { codigo: 'asc' } }, { talla: { valor: 'asc' } }],
      }),
    ]);

    const conteo = new Map(
      wipPorCelula.map((w) => [w.celulaActual, w._count._all]),
    );
    return {
      materiales: materiales.map((m) => ({
        materialId: m.material.id,
        codigo: m.material.codigo,
        nombre: m.material.nombreCanonico,
        unidad: m.material.unidadMedida.codigo,
        cantDisponible: Number(m.cantDisponible),
      })),
      wip: ORDEN_CELULAS.map((celula) => ({
        celula,
        pares: conteo.get(celula) ?? 0,
      })),
      pt: pt.map((i) => ({
        producto: i.productoConfigurado.nombreComercial,
        codigo: i.productoConfigurado.codigo,
        talla: i.talla.valor,
        bodega: i.bodega.nombre,
        cantDisponible: i.cantDisponible,
        cantReservada: i.cantReservada,
      })),
    };
  }

  kardex(limit = 50) {
    return this.prisma.movimientoInventario.findMany({
      take: Math.min(limit, 200),
      orderBy: { id: 'desc' },
      include: {
        material: {
          select: {
            codigo: true,
            nombreCanonico: true,
            unidadMedida: { select: { codigo: true } },
          },
        },
        inventarioPT: {
          select: {
            productoConfigurado: { select: { codigo: true, nombreComercial: true } },
            talla: { select: { valor: true } },
            bodega: { select: { nombre: true } },
          },
        },
        usuario: { select: { username: true } },
      },
    });
  }

  // Movimiento manual de materia prima (recepción de compra, devolución a
  // proveedor, consumo, ajuste). Los motivos del sistema se rechazan en el core.
  async movimientoMaterial(dto: MovimientoMaterialDto, user: Usuario) {
    const error = validarMovimientoMaterial(dto);
    if (error) throw new BadRequestException(error);

    const material = await this.prisma.material.findUnique({
      where: { id: dto.materialId },
    });
    if (!material) throw new NotFoundException(`Material ${dto.materialId} no existe`);

    return this.prisma.$transaction(async (tx) => {
      if (dto.tipo === 'ENTRADA') {
        await tx.inventarioMaterial.upsert({
          where: { materialId: dto.materialId },
          create: { materialId: dto.materialId, cantDisponible: dto.cantidad },
          update: { cantDisponible: { increment: dto.cantidad } },
        });
      } else {
        // Guarda de stock: la SALIDA solo aplica si hay disponible suficiente.
        const res = await tx.inventarioMaterial.updateMany({
          where: { materialId: dto.materialId, cantDisponible: { gte: dto.cantidad } },
          data: { cantDisponible: { decrement: dto.cantidad } },
        });
        if (res.count === 0)
          throw new ConflictException(
            `Stock insuficiente del material ${dto.materialId} para la salida`,
          );
      }
      return tx.movimientoInventario.create({
        data: {
          tipo: dto.tipo,
          motivo: dto.motivo,
          materialId: dto.materialId,
          cantidad: dto.cantidad,
          referencia: dto.referencia,
          observaciones: dto.observaciones,
          usuarioId: user.sub,
        },
      });
    });
  }
}
