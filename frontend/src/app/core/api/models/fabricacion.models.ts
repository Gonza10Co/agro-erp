import { IncidenciaPar } from './calidad.models';

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';
export type EstadoPar = 'EN_PROCESO' | 'TERMINADO' | 'CANCELADO' | 'DADO_DE_BAJA';
export type SubPasoGuarnicion = 'AREA' | 'ARMADO' | 'VISTAS' | 'CIERRE' | 'PREFORMADO' | 'PERFORADO' | 'REVISION' | 'STROBEL' | 'AMARRE';
export type EstadoOF = 'ABIERTA' | 'EN_PROCESO' | 'TERMINADA' | 'ANULADA';

export interface OFGenerada {
  id: number;
  consecutivo: number;
  opId: number;
  totalPares: number;
}

export interface OFListItem {
  id: number;
  consecutivo: number;
  estado: EstadoOF;
  fecha: string;
  op: { consecutivo: number };
  _count: { pares: number };
}

export interface ParTablero {
  id: number;
  codigo: string;
  celulaActual: Celula;
  subPasoActual: SubPasoGuarnicion | null;
  estado: EstadoPar;
  talla: { valor: string };
  of: { consecutivo: number };
}

export interface EventoTrazabilidad {
  id: number;
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  timestamp: string;
  operario: { nombre: string };
  maquina: { nombre: string };
}

export interface ParDetalle {
  id: number;
  codigo: string;
  celulaActual: Celula;
  subPasoActual: SubPasoGuarnicion | null;
  estado: EstadoPar;
  of: { consecutivo: number };
  talla: { valor: string };
  eventos: EventoTrazabilidad[];
  incidencias: IncidenciaPar[];
  reponeA: { codigo: string } | null;
  repuestoPor: { codigo: string } | null;
}

export interface Operario {
  id: number;
  nombre: string;
  celula: Celula;
}

export interface Maquina {
  id: number;
  codigo: string;
  nombre: string;
  celula: Celula;
}

export const ORDEN_CELULAS: Celula[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'];

export const ORDEN_SUBPASOS: SubPasoGuarnicion[] =
  ['AREA', 'ARMADO', 'VISTAS', 'CIERRE', 'PREFORMADO', 'PERFORADO', 'REVISION', 'STROBEL', 'AMARRE'];

export const LABEL_SUBPASO: Record<SubPasoGuarnicion, string> = {
  AREA: 'Área',
  ARMADO: 'Armado',
  VISTAS: 'Vistas',
  CIERRE: 'Cierre',
  PREFORMADO: 'Preformado',
  PERFORADO: 'Perforado y goleteado',
  REVISION: 'Revisión',
  STROBEL: 'Strobel',
  AMARRE: 'Amarre',
};

export const LABEL_CELULA: Record<Celula, string> = {
  CORTE: 'Corte',
  GUARNICION: 'Guarnición',
  ALMACEN: 'Almacén',
  INYECCION: 'Inyección',
  PT: 'P. Terminado',
};

export function siguienteCelulaLabel(c: Celula): string | null {
  const i = ORDEN_CELULAS.indexOf(c);
  if (i < 0 || i >= ORDEN_CELULAS.length - 1) return null;
  return LABEL_CELULA[ORDEN_CELULAS[i + 1]];
}

/** Etiqueta del próximo paso real: sub-paso si está en Guarnición, célula si no. null = no hay próximo (PT). */
export function siguientePasoLabel(celula: Celula, subPaso: SubPasoGuarnicion | null): string | null {
  if (celula === 'GUARNICION' && subPaso) {
    const i = ORDEN_SUBPASOS.indexOf(subPaso);
    if (i < ORDEN_SUBPASOS.length - 1) return LABEL_SUBPASO[ORDEN_SUBPASOS[i + 1]];
    return LABEL_CELULA['ALMACEN']; // desde AMARRE
  }
  return siguienteCelulaLabel(celula);
}

export const LABEL_ESTADO_PAR: Record<EstadoPar, string> = {
  EN_PROCESO: 'en proceso',
  TERMINADO: 'terminado',
  CANCELADO: 'cancelado',
  DADO_DE_BAJA: 'dado de baja',
};
