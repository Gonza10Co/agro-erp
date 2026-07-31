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

  async diario(
    anio: number,
    mes: number,
    lineaId?: number,
  ): Promise<ReporteDiario & { lineaId: number | null }> {
    const { desde, hasta } = rangoMes(anio, mes);
    const porLinea = lineaId != null;

    const [eventos, facturas, movimientosPT, saldoPrevio, metas] = await Promise.all([
      this.prisma.eventoTrazabilidad.findMany({
        // La línea vive denormalizada en el Par (línea por pedido).
        where: {
          timestamp: { gte: desde, lt: hasta },
          ...(porLinea ? { par: { lineaId } } : {}),
        },
        // El grado del par separa la columna Bodega (primeras) de Segundas.
        select: {
          celula: true,
          subPaso: true,
          subPasoInyeccion: true,
          timestamp: true,
          par: { select: { calidad: true } },
        },
      }),
      this.prisma.factura.findMany({
        // Dos caminos a la línea: las de producto la heredan vía despacho→OP (y
        // desde ahora también la llevan denormalizada), las de SERVICIO la traen
        // directo porque no tienen despacho. Sin el OR, la maquila de Feroz
        // quedaría fuera de su propio reporte.
        where: {
          fecha: { gte: desde, lt: hasta },
          estado: 'EMITIDA',
          ...(porLinea
            ? { OR: [{ lineaId }, { despacho: { op: { lineaId } } }] }
            : {}),
        },
        select: {
          fecha: true,
          tipo: true,
          subtotal: true,
          lineas: { select: { cantidad: true } },
        },
      }),
      // Kardex PT: cada movimiento sella la línea del pedido que lo originó
      // (par.lineaId / op.lineaId). Los históricos previos a la columna quedaron
      // con NULL: solo suman en "Todas las líneas".
      this.prisma.movimientoInventario.findMany({
        where: {
          inventarioPTId: { not: null },
          createdAt: { gte: desde, lt: hasta },
          ...(porLinea ? { lineaId } : {}),
        },
        select: { tipo: true, motivo: true, cantidad: true, createdAt: true },
      }),
      // Saldo de PT al inicio del mes = entradas − salidas de movimientos previos.
      this.prisma.movimientoInventario.groupBy({
        by: ['tipo'],
        where: {
          inventarioPTId: { not: null },
          createdAt: { lt: desde },
          ...(porLinea ? { lineaId } : {}),
        },
        _sum: { cantidad: true },
      }),
      // Sin filtro se compara contra la meta global (lineaId NULL); con filtro,
      // contra la meta propia de esa línea.
      this.prisma.meta.findMany({ where: { anio, mes, lineaId: lineaId ?? null } }),
    ]);

    const sumPrevio = (tipo: string) =>
      Number((saldoPrevio as any[]).find((g) => g.tipo === tipo)?._sum.cantidad ?? 0);
    const saldoInicialPT = sumPrevio('ENTRADA') - sumPrevio('SALIDA');

    const reporte = construirReporte({
      anio,
      mes,
      eventos: eventos.map((e) => ({
        celula: e.celula as Celula,
        subPaso: e.subPaso ?? null,
        subPasoInyeccion: e.subPasoInyeccion ?? null,
        timestamp: e.timestamp,
        esSegunda: e.par?.calidad === 'SEGUNDA',
      })),
      ventas: facturas.map((f) => ({
        fecha: f.fecha,
        pares: f.lineas.reduce((acc, l) => acc + l.cantidad, 0),
        valor: Number(f.subtotal), // valor de venta sin IVA, para comparar contra la meta comercial
        esServicio: f.tipo === 'SERVICIO',
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
    return { ...reporte, lineaId: lineaId ?? null };
  }

  async listarMetas(anio: number, mes: number, lineaId?: number): Promise<MetaMin[]> {
    const metas = await this.prisma.meta.findMany({
      where: { anio, mes, lineaId: lineaId ?? null },
    });
    return metas.map((m) => ({ tipo: m.tipo as TipoMeta, valor: Number(m.valor) }));
  }

  async guardarMetas(
    anio: number,
    mes: number,
    items: { tipo: TipoMeta; valor: number }[],
    lineaId?: number,
  ) {
    const linea = lineaId ?? null;
    for (const item of items) {
      // Upsert a mano: el unique compuesto no cubre lineaId NULL (en PG los NULL
      // son distintos entre sí), así que la clave global se resuelve por código.
      const existente = await this.prisma.meta.findFirst({
        where: { anio, mes, tipo: item.tipo, lineaId: linea },
      });
      if (existente) {
        await this.prisma.meta.update({
          where: { id: existente.id },
          data: { valor: item.valor },
        });
      } else {
        await this.prisma.meta.create({
          data: { anio, mes, tipo: item.tipo, valor: item.valor, lineaId: linea },
        });
      }
    }
    return this.listarMetas(anio, mes, lineaId);
  }
}
