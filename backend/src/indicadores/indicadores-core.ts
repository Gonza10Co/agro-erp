import { Celula, SubPasoGuarnicion } from '@prisma/client';

/** Un tramo de trabajo cerrado por un evento: duración atribuida a su etapa/operario/máquina. */
export interface Tramo {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  operarioId: number;
  operarioNombre: string;
  maquinaId: number;
  maquinaNombre: string;
  duracionMin: number;
}

/** Evento de trazabilidad con sus recursos (operario/máquina) embebidos. */
export interface EventoConRecursos {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  operarioId: number;
  operario: { nombre: string };
  maquinaId: number;
  maquina: { nombre: string };
  timestamp: Date;
}

const minutosEntre = (desde: Date, hasta: Date): number =>
  Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 60000));

/**
 * A partir del createdAt del par y sus eventos ORDENADOS por timestamp,
 * calcula el tramo que cierra cada evento: duración = evento − anterior
 * (createdAt para el primero). Par sin eventos → sin tramos.
 */
export function calcularTramos(createdAt: Date, eventos: EventoConRecursos[]): Tramo[] {
  const tramos: Tramo[] = [];
  let prev = createdAt;
  for (const e of eventos) {
    tramos.push({
      celula: e.celula,
      subPaso: e.subPaso,
      operarioId: e.operarioId,
      operarioNombre: e.operario.nombre,
      maquinaId: e.maquinaId,
      maquinaNombre: e.maquina.nombre,
      duracionMin: minutosEntre(prev, e.timestamp),
    });
    prev = e.timestamp;
  }
  return tramos;
}

export interface EtapaAgrupada {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  tramos: number;
  promedioMin: number;
}

/** Promedio y conteo de tramos por etapa (celula, subPaso). */
export function agruparPorEtapa(tramos: Tramo[]): EtapaAgrupada[] {
  const mapa = new Map<string, { celula: Celula; subPaso: SubPasoGuarnicion | null; suma: number; conteo: number }>();
  for (const t of tramos) {
    const key = t.celula + '|' + t.subPaso;
    const g = mapa.get(key);
    if (g) {
      g.suma += t.duracionMin;
      g.conteo++;
    } else {
      mapa.set(key, { celula: t.celula, subPaso: t.subPaso, suma: t.duracionMin, conteo: 1 });
    }
  }
  return Array.from(mapa.values()).map((g) => ({
    celula: g.celula,
    subPaso: g.subPaso,
    tramos: g.conteo,
    promedioMin: Math.round(g.suma / g.conteo),
  }));
}

export interface OperarioAgrupado {
  operarioId: number;
  nombre: string;
  tramos: number;
  promedioMin: number;
}

/** Promedio y conteo de tramos por operario, ordenado por # tramos desc (desempate nombre asc). */
export function agruparPorOperario(tramos: Tramo[]): OperarioAgrupado[] {
  const mapa = new Map<number, { nombre: string; suma: number; conteo: number }>();
  for (const t of tramos) {
    const g = mapa.get(t.operarioId);
    if (g) {
      g.suma += t.duracionMin;
      g.conteo++;
    } else {
      mapa.set(t.operarioId, { nombre: t.operarioNombre, suma: t.duracionMin, conteo: 1 });
    }
  }
  return Array.from(mapa.entries())
    .map(([operarioId, g]) => ({
      operarioId,
      nombre: g.nombre,
      tramos: g.conteo,
      promedioMin: Math.round(g.suma / g.conteo),
    }))
    .sort((a, b) => b.tramos - a.tramos || a.nombre.localeCompare(b.nombre));
}

export interface MaquinaAgrupada {
  maquinaId: number;
  nombre: string;
  tramos: number;
  promedioMin: number;
}

/** Promedio y conteo de tramos por máquina, ordenado por # tramos desc (desempate nombre asc). */
export function agruparPorMaquina(tramos: Tramo[]): MaquinaAgrupada[] {
  const mapa = new Map<number, { nombre: string; suma: number; conteo: number }>();
  for (const t of tramos) {
    const g = mapa.get(t.maquinaId);
    if (g) {
      g.suma += t.duracionMin;
      g.conteo++;
    } else {
      mapa.set(t.maquinaId, { nombre: t.maquinaNombre, suma: t.duracionMin, conteo: 1 });
    }
  }
  return Array.from(mapa.entries())
    .map(([maquinaId, g]) => ({
      maquinaId,
      nombre: g.nombre,
      tramos: g.conteo,
      promedioMin: Math.round(g.suma / g.conteo),
    }))
    .sort((a, b) => b.tramos - a.tramos || a.nombre.localeCompare(b.nombre));
}

/** Par EN_PROCESO con la etapa en la que está y desde cuándo (último evento o createdAt). */
export interface ParEnEtapa {
  codigo: string;
  celulaActual: Celula;
  subPasoActual: SubPasoGuarnicion | null;
  desde: Date;
}

export interface AlertaDemora {
  codigo: string;
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  minutosEnEtapa: number;
  umbralMin: number;
}

/**
 * Detecta pares demorados: el tiempo en la etapa actual (now − desde) supera el
 * umbral configurado para su célula. Sin umbral para la célula → no alerta.
 * Ordena por exceso (minutosEnEtapa − umbralMin) desc.
 */
export function detectarDemoras(
  pares: ParEnEtapa[],
  umbrales: Partial<Record<Celula, number>>,
  now: Date,
): AlertaDemora[] {
  const alertas: AlertaDemora[] = [];
  for (const p of pares) {
    const umbral = umbrales[p.celulaActual];
    if (umbral == null) continue;
    const minutosEnEtapa = minutosEntre(p.desde, now);
    if (minutosEnEtapa > umbral) {
      alertas.push({
        codigo: p.codigo,
        celula: p.celulaActual,
        subPaso: p.subPasoActual,
        minutosEnEtapa,
        umbralMin: umbral,
      });
    }
  }
  return alertas.sort((a, b) => (b.minutosEnEtapa - b.umbralMin) - (a.minutosEnEtapa - a.umbralMin));
}
