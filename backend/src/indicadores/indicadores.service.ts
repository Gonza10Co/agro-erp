import { Injectable } from '@nestjs/common';
import { Celula } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  agruparPorEtapa,
  agruparPorMaquina,
  agruparPorOperario,
  calcularTramos,
  detectarDemoras,
  ParEnEtapa,
} from './indicadores-core';

@Injectable()
export class IndicadoresService {
  constructor(private readonly prisma: PrismaService) {}

  async indicadores(now: Date = new Date()) {
    const pares = await this.prisma.par.findMany({
      select: {
        codigo: true,
        createdAt: true,
        celulaActual: true,
        subPasoActual: true,
        estado: true,
        eventos: {
          orderBy: { timestamp: 'asc' },
          select: {
            celula: true,
            subPaso: true,
            operarioId: true,
            maquinaId: true,
            timestamp: true,
            operario: { select: { nombre: true } },
            maquina: { select: { nombre: true } },
          },
        },
      },
    });

    const tramos = pares.flatMap((p) => calcularTramos(p.createdAt, p.eventos as any));

    const etapas = agruparPorEtapa(tramos);
    const operarios = agruparPorOperario(tramos);
    const maquinas = agruparPorMaquina(tramos);

    const filas = await this.prisma.umbralDemora.findMany();
    const umbrales: Partial<Record<Celula, number>> = Object.fromEntries(
      filas.map((f) => [f.celula, f.minutos]),
    );

    const enProceso: ParEnEtapa[] = pares
      .filter((p) => p.estado === 'EN_PROCESO')
      .map((p) => {
        const ultimoEvento = p.eventos[p.eventos.length - 1];
        return {
          codigo: p.codigo,
          celulaActual: p.celulaActual,
          subPasoActual: p.subPasoActual,
          desde: ultimoEvento?.timestamp ?? p.createdAt,
        };
      });

    const alertas = detectarDemoras(enProceso, umbrales, now);

    return { etapas, operarios, maquinas, alertas };
  }
}
