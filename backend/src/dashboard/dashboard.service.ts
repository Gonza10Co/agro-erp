import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rangoMes } from './dashboard-core';
import { saldoFactura, resumenCartera } from '../cartera/cartera-core';

const ESTADOS_OC = ['BORRADOR', 'CONFIRMADA', 'EN_PRODUCCION', 'CERRADA', 'ANULADA'] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async resumen() {
    const hoy = new Date();
    const { desde, hasta } = rangoMes(hoy);

    const [
      ocPorEstado,
      ofActivas,
      paresPorCelula,
      despachosMes,
      facAgg,
      facturas,
      clientesVencidos,
    ] = await Promise.all([
      this.prisma.ordenCompra.groupBy({ by: ['estado'], _count: { _all: true } }),
      this.prisma.ordenFabricacion.count({ where: { estado: { in: ['ABIERTA', 'EN_PROCESO'] } } }),
      this.prisma.par.groupBy({ by: ['celulaActual'], where: { estado: 'EN_PROCESO' }, _count: { _all: true } }),
      this.prisma.despacho.count({ where: { fecha: { gte: desde, lt: hasta } } }),
      this.prisma.factura.aggregate({
        where: { fecha: { gte: desde, lt: hasta }, estado: 'EMITIDA' },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.factura.findMany({
        where: { estado: 'EMITIDA' },
        select: { total: true, fechaVencimiento: true, pagos: { select: { monto: true } } },
      }),
      this.prisma.cliente.count({ where: { estadoCartera: { in: ['VENCIDO', 'BLOQUEADO'] } } }),
    ]);

    // Pedidos por estado → objeto con todos los estados (0 si no aparecen).
    const porEstado: Record<string, number> = {};
    for (const e of ESTADOS_OC) porEstado[e] = 0;
    for (const g of ocPorEstado as any[]) porEstado[g.estado] = g._count._all;
    const enCurso = porEstado['CONFIRMADA'] + porEstado['EN_PRODUCCION'];

    // Pares en proceso por célula.
    const porCelula = (paresPorCelula as any[]).map((g) => ({
      celula: g.celulaActual as string,
      pares: g._count._all as number,
    }));
    const paresEnProceso = porCelula.reduce((acc, c) => acc + c.pares, 0);

    // Cartera: saldos a partir de las facturas con sus pagos.
    const facturasSaldo = facturas.map((f) => ({
      total: Number(f.total),
      pagado: f.pagos.reduce((acc, p) => acc + Number(p.monto), 0),
      saldo: saldoFactura(Number(f.total), f.pagos.map((p) => ({ monto: Number(p.monto) }))),
      fechaVencimiento: f.fechaVencimiento,
    }));
    const resCartera = resumenCartera(facturasSaldo, hoy);

    return {
      pedidos: { porEstado, enCurso },
      produccion: { ofActivas, paresEnProceso, porCelula },
      despachosMes,
      facturacionMes: {
        total: Number(facAgg._sum.total ?? 0),
        count: facAgg._count._all,
      },
      cartera: {
        saldoTotal: resCartera.saldo,
        saldoVencido: resCartera.saldoVencido,
        clientesVencidos,
      },
    };
  }
}
