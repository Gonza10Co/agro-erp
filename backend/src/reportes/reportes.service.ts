import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  construirReporte,
  Celula,
  MetaMin,
  ReporteDiario,
  TipoMeta,
} from './reporte-diario-core';

/** Rango [1° del mes, 1° del mes siguiente) en UTC a partir de anio/mes (mes 1..12). */
function rangoMes(anio: number, mes: number) {
  return {
    desde: new Date(Date.UTC(anio, mes - 1, 1)),
    hasta: new Date(Date.UTC(anio, mes, 1)),
  };
}

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async diario(anio: number, mes: number): Promise<ReporteDiario> {
    const { desde, hasta } = rangoMes(anio, mes);

    const [eventos, facturas, movimientosPT, saldoPrevio, metas] = await Promise.all([
      this.prisma.eventoTrazabilidad.findMany({
        where: { timestamp: { gte: desde, lt: hasta } },
        select: { celula: true, subPaso: true, timestamp: true },
      }),
      this.prisma.factura.findMany({
        where: { fecha: { gte: desde, lt: hasta }, estado: 'EMITIDA' },
        select: { fecha: true, total: true, lineas: { select: { cantidad: true } } },
      }),
      this.prisma.movimientoInventario.findMany({
        where: { inventarioPTId: { not: null }, createdAt: { gte: desde, lt: hasta } },
        select: { tipo: true, motivo: true, cantidad: true, createdAt: true },
      }),
      // Saldo de PT al inicio del mes = entradas − salidas de movimientos previos.
      this.prisma.movimientoInventario.groupBy({
        by: ['tipo'],
        where: { inventarioPTId: { not: null }, createdAt: { lt: desde } },
        _sum: { cantidad: true },
      }),
      this.prisma.meta.findMany({ where: { anio, mes } }),
    ]);

    const sumPrevio = (tipo: string) =>
      Number((saldoPrevio as any[]).find((g) => g.tipo === tipo)?._sum.cantidad ?? 0);
    const saldoInicialPT = sumPrevio('ENTRADA') - sumPrevio('SALIDA');

    return construirReporte({
      anio,
      mes,
      eventos: eventos.map((e) => ({
        celula: e.celula as Celula,
        subPaso: e.subPaso ?? null,
        timestamp: e.timestamp,
      })),
      ventas: facturas.map((f) => ({
        fecha: f.fecha,
        pares: f.lineas.reduce((acc, l) => acc + l.cantidad, 0),
        valor: Number(f.total),
      })),
      metas: metas.map((m) => ({ tipo: m.tipo as TipoMeta, valor: Number(m.valor) })),
      saldoInicialPT,
      movimientosPT: movimientosPT.map((m) => ({
        tipo: m.tipo as 'ENTRADA' | 'SALIDA' | 'AJUSTE',
        motivo: m.motivo as string,
        cantidad: Number(m.cantidad),
        createdAt: m.createdAt,
      })),
    });
  }

  async listarMetas(anio: number, mes: number): Promise<MetaMin[]> {
    const metas = await this.prisma.meta.findMany({ where: { anio, mes } });
    return metas.map((m) => ({ tipo: m.tipo as TipoMeta, valor: Number(m.valor) }));
  }

  async guardarMetas(anio: number, mes: number, items: { tipo: TipoMeta; valor: number }[]) {
    for (const item of items) {
      await this.prisma.meta.upsert({
        where: { anio_mes_tipo: { anio, mes, tipo: item.tipo } },
        create: { anio, mes, tipo: item.tipo, valor: item.valor },
        update: { valor: item.valor },
      });
    }
    return this.listarMetas(anio, mes);
  }
}
