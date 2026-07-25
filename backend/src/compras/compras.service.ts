import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { siguienteConsecutivo } from '../prisma/consecutivo';
import { BomLoaderService } from '../catalog/bom/bom-loader.service';
import { resolverBom } from '../catalog/bom/bom-resolver';
import { EntradaResolucion } from '../catalog/bom/bom-resolver.types';
import {
  construirLineasRequerimiento,
  agruparPorProveedor,
  LineaSalida,
} from './requerimiento-calculo';
import { liberarReservasDeOp } from './reserva-insumos';

type DecimalLike = { toNumber(): number } | number | null;
const num = (d: DecimalLike): number =>
  d == null ? 0 : typeof d === 'number' ? d : d.toNumber();

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bomLoader: BomLoaderService,
  ) {}

  /** Envoltorio espiable del resolver puro de Demo 2. */
  protected resolver(entrada: EntradaResolucion) {
    return resolverBom(entrada);
  }

  async calcularRequerimiento(opId: number) {
    const op = await this.prisma.ordenProduccion.findUnique({
      where: { id: opId },
      include: {
        lineas: {
          include: {
            productoConfigurado: { include: { opciones: true } },
            tallas: { include: { talla: true } },
          },
        },
      },
    });
    if (!op) throw new NotFoundException(`OP ${opId} no existe`);

    const bruto = new Map<number, number>();
    for (const linea of op.lineas as any[]) {
      const pc = linea.productoConfigurado;
      const opcionIds = pc.opciones.map((o: any) => o.opcionId);
      const tallasActivas = (linea.tallas as any[]).filter(
        (t) => t.cantAProducir > 0,
      );
      if (!tallasActivas.length) continue;
      // El BOM/overrides/materiales no dependen de la talla: se cargan una vez
      // por línea y solo se varía `talla` al resolver cada curva. Evita el N+1.
      const entradaBase = await this.bomLoader.cargarEntrada({
        referenciaId: pc.referenciaId,
        marcaId: pc.marcaId,
        opcionIds,
        talla: tallasActivas[0].talla.valor,
      });
      for (const t of tallasActivas) {
        const { comprados } = this.resolver({ ...entradaBase, talla: t.talla.valor });
        for (const c of comprados) {
          bruto.set(
            c.materialId,
            (bruto.get(c.materialId) ?? 0) + c.consumo * t.cantAProducir,
          );
        }
      }
    }

    const ids = [...bruto.keys()];
    const materialRows = ids.length
      ? await this.prisma.material.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            codigo: true,
            nombreCanonico: true,
            proveedorId: true,
            proveedor: { select: { id: true, nombre: true } },
          },
        })
      : [];

    const proveedorPorMaterial = new Map<number, number | null>(
      (materialRows as any[]).map((m) => [m.id, m.proveedorId ?? null]),
    );
    const matInfo = new Map<number, any>(
      (materialRows as any[]).map((m) => [m.id, m]),
    );

    // El amarre de insumos vive dentro de la transacción: lock pesimista sobre
    // el stock (mismo patrón del amarre de PT) para que dos pedidos concurrentes
    // no reserven el mismo material a la vez.
    const { requerimiento, lineasData } = await this.prisma.$transaction(
      async (tx) => {
        // Recalcular re-amarra desde cero: se libera el amarre previo de la OP.
        await liberarReservasDeOp(tx, op.id);

        if (ids.length) {
          await tx.$queryRaw`SELECT id FROM "InventarioMaterial" WHERE "materialId" IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
        }
        const stockRows = ids.length
          ? await tx.inventarioMaterial.findMany({
              where: { materialId: { in: ids } },
            })
          : [];
        const stock = new Map<number, number>(
          (stockRows as any[]).map((r) => [r.materialId, num(r.cantDisponible)]),
        );
        const reservado = new Map<number, number>(
          (stockRows as any[]).map((r) => [r.materialId, num(r.cantReservada)]),
        );

        const lineasData = construirLineasRequerimiento(
          bruto,
          stock,
          reservado,
          proveedorPorMaterial,
        );

        const consecutivo = await siguienteConsecutivo(tx, 'req');
        const requerimiento = await tx.requerimientoCompra.create({
          data: {
            consecutivo,
            opId: op.id,
            lineas: { create: lineasData },
          },
        });

        // Amarra la bodega: lo reservado sube al agregado por material.
        for (const l of lineasData) {
          if (l.cantReservada > 0) {
            await tx.inventarioMaterial.update({
              where: { materialId: l.materialId },
              data: { cantReservada: { increment: l.cantReservada } },
            });
          }
        }
        return { requerimiento, lineasData };
      },
    );

    const lineasSalida: LineaSalida[] = lineasData.map((l) => {
      const m = matInfo.get(l.materialId);
      return {
        ...l,
        materialCodigo: m?.codigo ?? '',
        materialNombre: m?.nombreCanonico ?? '',
        proveedorNombre: m?.proveedor?.nombre ?? null,
      };
    });

    return {
      id: requerimiento.id,
      consecutivo: requerimiento.consecutivo,
      opId: requerimiento.opId,
      fecha: requerimiento.fecha,
      estado: requerimiento.estado ?? 'CALCULADO',
      reservaActiva: true,
      grupos: agruparPorProveedor(lineasSalida),
    };
  }

  async obtener(id: number) {
    const r = await this.prisma.requerimientoCompra.findUnique({
      where: { id },
      include: {
        lineas: {
          include: {
            material: { select: { codigo: true, nombreCanonico: true } },
            proveedor: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (!r) throw new NotFoundException(`Requerimiento ${id} no existe`);
    const lineasSalida: LineaSalida[] = (r.lineas as any[]).map((l) => ({
      materialId: l.materialId,
      proveedorId: l.proveedorId,
      cantNecesaria: num(l.cantNecesaria),
      cantDisponible: num(l.cantDisponible),
      cantReservada: num(l.cantReservada),
      cantAComprar: num(l.cantAComprar),
      materialCodigo: l.material.codigo,
      materialNombre: l.material.nombreCanonico,
      proveedorNombre: l.proveedor?.nombre ?? null,
    }));
    return {
      id: r.id,
      consecutivo: r.consecutivo,
      opId: r.opId,
      fecha: r.fecha,
      estado: r.estado,
      reservaActiva: (r as any).reservaActiva ?? false,
      grupos: agruparPorProveedor(lineasSalida),
    };
  }

  listarPorOp(opId: number) {
    return this.prisma.requerimientoCompra.findMany({
      where: { opId },
      orderBy: { consecutivo: 'desc' },
      select: { id: true, consecutivo: true, fecha: true, reservaActiva: true },
    });
  }

  listarProveedores() {
    return this.prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nit: true, nombre: true, ciudad: true },
    });
  }

  listarInventarioMaterial() {
    return this.prisma.inventarioMaterial.findMany({
      include: { material: { select: { codigo: true, nombreCanonico: true } } },
      orderBy: { materialId: 'asc' },
    });
  }
}
