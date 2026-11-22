import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommercialDimension,
  CommercialFact,
  CommercialFilters,
  CommercialReport,
  OrderStatus,
  buildCommercialReport,
  orderMonth,
} from './commercial-report-core';

/** Quién ve el reporte comercial: gerencia, comercial (usuarios de la fábrica) y la demo. */
export const ROLES_COMMERCIAL_REPORT = ['ADMIN', 'GERENTE', 'CLIENTE', 'STAGE'];

export interface CommercialQuery {
  /** 'YYYY-MM-DD' inclusive */
  from: string;
  /** 'YYYY-MM-DD' inclusive */
  to: string;
  rows: CommercialDimension;
  filters: CommercialFilters;
}

const DAY = 86_400_000;
const COL_OFFSET = 5 * 3_600_000;

const toNumber = (v: unknown): number | null => (v == null ? null : Number(v));

@Injectable()
export class CommercialReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(q: CommercialQuery): Promise<CommercialReport> {
    // Se traen SOLO por rango de fechas: el resto de filtros se aplica en memoria para
    // que las opciones de cada filtro no se encojan con los otros.
    const fromDay = new Date(`${q.from}T00:00:00Z`);
    const toDay = new Date(`${q.to}T00:00:00Z`);
    const orders = await this.prisma.ordenCompra.findMany({
      where: {
        OR: [
          { fechaPedidoCliente: { gte: fromDay, lte: toDay } },
          {
            fechaPedidoCliente: null,
            fecha: { gte: new Date(fromDay.getTime() + COL_OFFSET), lt: new Date(toDay.getTime() + DAY + COL_OFFSET) },
          },
        ],
      },
      select: {
        id: true,
        estado: true,
        paraStock: true,
        fecha: true,
        fechaPedidoCliente: true,
        clienteId: true,
        cliente: { select: { nombre: true } },
        linea: { select: { id: true, nombre: true } },
        lineas: {
          select: {
            productoConfiguradoId: true,
            calidad: true,
            precioUnitario: true,
            tallas: { select: { cantidad: true } },
            productoConfigurado: {
              select: {
                referencia: { select: { id: true, codigo: true, nombreInterno: true } },
                marca: { select: { id: true, nombre: true, linea: { select: { id: true, nombre: true } } } },
              },
            },
          },
        },
        ordenProduccion: {
          select: { despachos: { select: { lineas: { select: { productoConfiguradoId: true, calidad: true, cantidad: true } } } } },
        },
      },
    });
    return buildCommercialReport(ordersToFacts(orders as unknown as OrderRow[]), {
      from: q.from,
      to: q.to,
      rows: q.rows,
      filters: q.filters,
    });
  }
}

/** Forma mínima de la OC que sale de la consulta (exportada para los tests). */
export interface OrderRow {
  id: number;
  estado: string;
  paraStock: boolean;
  fecha: Date;
  fechaPedidoCliente: Date | null;
  clienteId: number;
  cliente: { nombre: string };
  linea: { id: number; nombre: string } | null;
  lineas: {
    productoConfiguradoId: number;
    calidad: string;
    precioUnitario: unknown;
    tallas: { cantidad: number }[];
    productoConfigurado: {
      referencia: { id: number; codigo: string; nombreInterno: string };
      marca: { id: number; nombre: string; linea: { id: number; nombre: string } | null };
    };
  }[];
  ordenProduccion: { despachos: { lineas: { productoConfiguradoId: number; calidad: string; cantidad: number }[] }[] } | null;
}

/**
 * Un hecho por pedido × producto × calidad. Lo despachado se casa por producto y
 * calidad (el remito no sabe de renglones); si el pedido repite producto y calidad en
 * dos renglones, el despacho cae en el primero.
 */
export function ordersToFacts(orders: OrderRow[]): CommercialFact[] {
  const facts: CommercialFact[] = [];
  for (const oc of orders) {
    const month = orderMonth(oc.fechaPedidoCliente, oc.fecha);
    const dispatched = new Map<string, number>();
    for (const d of oc.ordenProduccion?.despachos ?? []) {
      for (const l of d.lineas) {
        const k = `${l.productoConfiguradoId}|${l.calidad}`;
        dispatched.set(k, (dispatched.get(k) ?? 0) + l.cantidad);
      }
    }
    for (const l of oc.lineas) {
      const k = `${l.productoConfiguradoId}|${l.calidad}`;
      const pairs = l.tallas.reduce((s, t) => s + t.cantidad, 0);
      const price = toNumber(l.precioUnitario);
      const ref = l.productoConfigurado.referencia;
      const brand = l.productoConfigurado.marca;
      const line = oc.linea ?? brand.linea;
      const refName = ref.nombreInterno && ref.nombreInterno !== ref.codigo ? `${ref.codigo} · ${ref.nombreInterno}` : ref.codigo;
      facts.push({
        orderId: oc.id,
        month,
        status: oc.estado as OrderStatus,
        forStock: oc.paraStock,
        clientId: oc.clienteId,
        clientName: oc.cliente.nombre,
        brandId: brand.id,
        brandName: brand.nombre,
        referenceId: ref.id,
        referenceName: refName,
        lineId: line?.id ?? null,
        lineName: line?.nombre ?? 'Sin línea',
        pairs,
        dispatched: dispatched.get(k) ?? 0,
        value: price == null ? 0 : price * pairs,
        unpricedPairs: price == null ? pairs : 0,
      });
      dispatched.delete(k);
    }
  }
  return facts;
}
