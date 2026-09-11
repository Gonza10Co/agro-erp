import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rangoMes } from './dashboard-core';
import { saldoFactura, resumenCartera } from '../cartera/cartera-core';
import { FabricacionService } from '../fabricacion/fabricacion.service';

const ESTADOS_OC = ['BORRADOR', 'CONFIRMADA', 'EN_PRODUCCION', 'CERRADA', 'ANULADA'] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fabricacion: FabricacionService,
  ) {}

  async resumen() {
    const hoy = new Date();
    const { desde, hasta } = rangoMes(hoy);

    const [
      ocPorEstado,
      ofActivas,
      planta,
      despachosMes,
      facAgg,
      facturas,
      clientesVencidos,
    ] = await Promise.all([
      this.prisma.ordenCompra.groupBy({ by: ['estado'], _count: { _all: true } }),
      this.prisma.ordenFabricacion.count({ where: { estado: { in: ['ABIERTA', 'EN_PROCESO'] } } }),
      // El mismo resumen del tablero: columnas por ESTACIÓN, que es lo que la planta reconoce.
      this.fabricacion.tableroResumen(),
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

    // Pares en proceso por estación (Corte es lo que falta por nacer, no pares reales).
    const porEstacion = planta.estaciones.map((e) => ({
      codigo: e.codigo,
      nombre: e.nombre,
      pares: e.total,
    }));
    const paresEnProceso = planta.total - planta.terminados - planta.fueraDeFlujo;

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
      produccion: { ofActivas, paresEnProceso, porEstacion, programado: planta.programado },
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
