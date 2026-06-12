import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import {
  estadoOcp,
  validarDevolucion,
  validarRecepcion,
} from './compras-proveedor-core';
import { RegistrarRecepcionDto } from './dto/registrar-recepcion.dto';
import { RegistrarDevolucionDto } from './dto/registrar-devolucion.dto';

interface Usuario {
  sub: number;
  role: string;
}

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber();

@Injectable()
export class ComprasProveedorService {
  constructor(private readonly prisma: PrismaService) {}

  // Del requerimiento nacen las OCP: una por proveedor con las líneas por comprar.
  // Los materiales sin proveedor no frenan el flujo: se devuelven como advertencia.
  async generarDesdeRequerimiento(reqId: number) {
    const req = await this.prisma.requerimientoCompra.findUnique({
      where: { id: reqId },
      include: {
        lineas: {
          include: { material: { select: { codigo: true, nombreCanonico: true } } },
        },
      },
    });
    if (!req) throw new NotFoundException(`Requerimiento ${reqId} no existe`);
    if (req.estado === 'CON_ORDEN')
      throw new ConflictException(
        `El requerimiento ${reqId} ya tiene órdenes de compra generadas`,
      );

    const porComprar = (req.lineas as any[]).filter((l) => num(l.cantAComprar) > 0);
    const sinProveedor = porComprar
      .filter((l) => l.proveedorId == null)
      .map((l) => ({
        materialId: l.materialId,
        codigo: l.material.codigo,
        nombre: l.material.nombreCanonico,
        cantAComprar: num(l.cantAComprar),
      }));
    const conProveedor = porComprar.filter((l) => l.proveedorId != null);
    if (!conProveedor.length)
      throw new BadRequestException(
        'El requerimiento no tiene líneas por comprar con proveedor asignado',
      );

    const grupos = new Map<number, any[]>();
    for (const l of conProveedor) {
      const lista = grupos.get(l.proveedorId) ?? [];
      lista.push(l);
      grupos.set(l.proveedorId, lista);
    }

    const ordenes = await this.prisma.$transaction(async (tx) => {
      const creadas: any[] = [];
      for (const [proveedorId, lineas] of grupos) {
        const consecutivo = await siguienteConsecutivo(tx, 'ocp');
        const ocp = await tx.ordenCompraProveedor.create({
          data: {
            consecutivo,
            proveedorId,
            requerimientoId: req.id,
            lineas: {
              create: lineas.map((l) => ({
                materialId: l.materialId,
                cantPedida: num(l.cantAComprar),
              })),
            },
          },
          include: { proveedor: { select: { id: true, nombre: true } } },
        });
        creadas.push({
          id: ocp.id,
          consecutivo: ocp.consecutivo,
          proveedor: ocp.proveedor,
          totalLineas: lineas.length,
        });
      }
      await tx.requerimientoCompra.update({
        where: { id: req.id },
        data: { estado: 'CON_ORDEN' },
      });
      return creadas;
    });

    return { ordenes, sinProveedor };
  }

  async listar() {
    const ocps = await this.prisma.ordenCompraProveedor.findMany({
      orderBy: { consecutivo: 'desc' },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        requerimiento: { select: { id: true, consecutivo: true } },
        lineas: { select: { cantPedida: true, cantRecibida: true } },
      },
    });
    return (ocps as any[]).map((o) => ({
      id: o.id,
      consecutivo: o.consecutivo,
      proveedor: o.proveedor,
      requerimiento: o.requerimiento,
      fecha: o.fecha,
      estado: o.estado,
      totalPedido: o.lineas.reduce((s: number, l: any) => s + num(l.cantPedida), 0),
      totalRecibido: o.lineas.reduce((s: number, l: any) => s + num(l.cantRecibida), 0),
    }));
  }

  async obtener(id: number) {
    const o = await this.prisma.ordenCompraProveedor.findUnique({
      where: { id },
      include: {
        proveedor: { select: { id: true, nombre: true } },
        requerimiento: { select: { id: true, consecutivo: true } },
        lineas: {
          include: {
            material: {
              select: {
                codigo: true,
                nombreCanonico: true,
                unidadMedida: { select: { codigo: true } },
              },
            },
          },
          orderBy: { id: 'asc' },
        },
        recepciones: {
          include: { lineas: true },
          orderBy: { consecutivo: 'asc' },
        },
        devoluciones: {
          include: {
            lineas: {
              include: {
                material: { select: { codigo: true, nombreCanonico: true } },
              },
            },
          },
          orderBy: { consecutivo: 'asc' },
        },
      },
    });
    if (!o) throw new NotFoundException(`Orden de compra ${id} no existe`);

    return {
      id: o.id,
      consecutivo: o.consecutivo,
      proveedor: o.proveedor,
      requerimiento: o.requerimiento,
      fecha: o.fecha,
      estado: o.estado,
      observaciones: o.observaciones,
      lineas: (o.lineas as any[]).map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCodigo: l.material.codigo,
        materialNombre: l.material.nombreCanonico,
        unidad: l.material.unidadMedida.codigo,
        cantPedida: num(l.cantPedida),
        cantRecibida: num(l.cantRecibida),
        pendiente: num(l.cantPedida) - num(l.cantRecibida),
      })),
      recepciones: (o.recepciones as any[]).map((r) => ({
        id: r.id,
        consecutivo: r.consecutivo,
        fecha: r.fecha,
        observaciones: r.observaciones,
        lineas: (r.lineas as any[]).map((l) => ({
          ocpLineaId: l.ocpLineaId,
          cantidad: num(l.cantidad),
        })),
      })),
      devoluciones: (o.devoluciones as any[]).map((d) => ({
        id: d.id,
        consecutivo: d.consecutivo,
        fecha: d.fecha,
        causa: d.causa,
        observaciones: d.observaciones,
        lineas: (d.lineas as any[]).map((l) => ({
          materialId: l.materialId,
          materialCodigo: l.material?.codigo,
          materialNombre: l.material?.nombreCanonico,
          cantidad: num(l.cantidad),
        })),
      })),
    };
  }

  // Recepción (parcial o total) en una sola tx: documento + cantRecibida +
  // inventario de MP + kardex ENTRADA/COMPRA + estado derivado. Patrón Demo 12.
  async registrarRecepcion(ocpId: number, dto: RegistrarRecepcionDto, user: Usuario) {
    const ocp = await this.prisma.ordenCompraProveedor.findUnique({
      where: { id: ocpId },
      include: { lineas: true },
    });
    if (!ocp) throw new NotFoundException(`Orden de compra ${ocpId} no existe`);
    if (ocp.estado === 'COMPLETA')
      throw new ConflictException(`La OCP-${ocp.consecutivo} ya está completa`);

    const lineasOcp = (ocp.lineas as any[]).map((l) => ({
      id: l.id,
      materialId: l.materialId,
      cantPedida: num(l.cantPedida),
      cantRecibida: num(l.cantRecibida),
    }));
    const error = validarRecepcion(lineasOcp, dto.lineas);
    if (error) throw new BadRequestException(error);

    const porLineaId = new Map(lineasOcp.map((l) => [l.id, l]));
    const referencia = `OCP-${ocp.consecutivo}`;

    return this.prisma.$transaction(async (tx) => {
      const consecutivo = await siguienteConsecutivo(tx, 'recepcion');
      const recepcion = await tx.recepcionCompra.create({
        data: {
          consecutivo,
          ocpId: ocp.id,
          observaciones: dto.observaciones,
          usuarioId: user.sub,
          lineas: {
            create: dto.lineas.map((l) => ({
              ocpLineaId: l.ocpLineaId,
              cantidad: l.cantidad,
            })),
          },
        },
      });

      for (const l of dto.lineas) {
        const materialId = porLineaId.get(l.ocpLineaId)!.materialId;
        await tx.ordenCompraProveedorLinea.update({
          where: { id: l.ocpLineaId },
          data: { cantRecibida: { increment: l.cantidad } },
        });
        await tx.inventarioMaterial.upsert({
          where: { materialId },
          create: { materialId, cantDisponible: l.cantidad },
          update: { cantDisponible: { increment: l.cantidad } },
        });
      }
      await tx.movimientoInventario.createMany({
        data: dto.lineas.map((l) => ({
          tipo: 'ENTRADA',
          motivo: 'COMPRA',
          materialId: porLineaId.get(l.ocpLineaId)!.materialId,
          cantidad: l.cantidad,
          referencia,
          observaciones: dto.observaciones,
          usuarioId: user.sub,
        })),
      });

      // Estado derivado: se calcula en memoria con las cantidades ya incrementadas.
      const recibidoPorLinea = new Map(dto.lineas.map((l) => [l.ocpLineaId, l.cantidad]));
      const estado = estadoOcp(
        lineasOcp.map((l) => ({
          cantPedida: l.cantPedida,
          cantRecibida: l.cantRecibida + (recibidoPorLinea.get(l.id) ?? 0),
        })),
      );
      await tx.ordenCompraProveedor.update({
        where: { id: ocp.id },
        data: { estado },
      });

      return { id: recepcion.id, consecutivo: recepcion.consecutivo, estado };
    });
  }

  // Devolución por calidad: descuenta stock (guarda gte, evita carreras) + kardex
  // SALIDA/DEVOLUCION_PROVEEDOR. No toca cantRecibida ni el estado: la mercancía
  // llegó; la devolución es el movimiento inverso documentado con su causa.
  async registrarDevolucion(ocpId: number, dto: RegistrarDevolucionDto, user: Usuario) {
    const ocp = await this.prisma.ordenCompraProveedor.findUnique({
      where: { id: ocpId },
      include: { lineas: true },
    });
    if (!ocp) throw new NotFoundException(`Orden de compra ${ocpId} no existe`);

    const error = validarDevolucion(dto.causa, dto.lineas);
    if (error) throw new BadRequestException(error);

    const materialesOcp = new Set((ocp.lineas as any[]).map((l) => l.materialId));
    for (const l of dto.lineas) {
      if (!materialesOcp.has(l.materialId))
        throw new BadRequestException(
          `El material ${l.materialId} no pertenece a la OCP-${ocp.consecutivo}`,
        );
    }

    const referencia = `OCP-${ocp.consecutivo}`;

    return this.prisma.$transaction(async (tx) => {
      for (const l of dto.lineas) {
        const res = await tx.inventarioMaterial.updateMany({
          where: { materialId: l.materialId, cantDisponible: { gte: l.cantidad } },
          data: { cantDisponible: { decrement: l.cantidad } },
        });
        if (res.count === 0)
          throw new ConflictException(
            `Stock insuficiente del material ${l.materialId} para devolver ${l.cantidad}`,
          );
      }

      const consecutivo = await siguienteConsecutivo(tx, 'devolucion');
      const devolucion = await tx.devolucionProveedor.create({
        data: {
          consecutivo,
          ocpId: ocp.id,
          causa: dto.causa.trim(),
          observaciones: dto.observaciones,
          usuarioId: user.sub,
          lineas: {
            create: dto.lineas.map((l) => ({
              materialId: l.materialId,
              cantidad: l.cantidad,
            })),
          },
        },
      });
      await tx.movimientoInventario.createMany({
        data: dto.lineas.map((l) => ({
          tipo: 'SALIDA',
          motivo: 'DEVOLUCION_PROVEEDOR',
          materialId: l.materialId,
          cantidad: l.cantidad,
          referencia,
          observaciones: dto.causa.trim(),
          usuarioId: user.sub,
        })),
      });

      return { id: devolucion.id, consecutivo: devolucion.consecutivo };
    });
  }
}
