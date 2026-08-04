import { IncidenciaPar } from './calidad.models';

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';
export type EstadoPar = 'EN_PROCESO' | 'TERMINADO' | 'CANCELADO' | 'DADO_DE_BAJA';
export type SubPasoGuarnicion = 'AREA' | 'ARMADO' | 'VISTAS' | 'CIERRE' | 'PREFORMADO' | 'PERFORADO' | 'REVISION' | 'STROBEL' | 'AMARRE';
export type SubPasoInyeccion = 'MONTAJE' | 'INYECCION' | 'FINIZAJE' | 'IMPACTO';
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

export interface OFDetallePar {
  id: number;
  codigo: string;
  celulaActual: Celula;
  estado: EstadoPar;
  talla: { valor: string };
  productoConfigurado: { codigo: string; nombreComercial: string } | null;
  linea: { codigo: string; nombre: string } | null;
}

export interface OFDetalle {
  id: number;
  consecutivo: number;
  estado: EstadoOF;
  fecha: string;
  op: { consecutivo: number };
  pares: OFDetallePar[];
}

export interface ParTablero {
  id: number;
  codigo: string;
  celulaActual: Celula;
  subPasoActual: SubPasoGuarnicion | null;
  subPasoInyeccion: SubPasoInyeccion | null;
  estado: EstadoPar;
  talla: { valor: string };
  of: { consecutivo: number };
}

export interface EventoTrazabilidad {
  id: number;
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  subPasoInyeccion: SubPasoInyeccion | null;
  timestamp: string;
  operario: { nombre: string };
  maquina: { nombre: string };
}

export interface ParDetalle {
  id: number;
  codigo: string;
  celulaActual: Celula;
  subPasoActual: SubPasoGuarnicion | null;
  subPasoInyeccion: SubPasoInyeccion | null;
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

/**
 * Inyección tampoco es una sola estación (JP, 2026-07-30). FINIZAJE es el acabado
 * —crayola, gama, gardenia, lija— y el IMPACTO es la salida de la célula.
 */
export const ORDEN_SUBPASOS_INYECCION: SubPasoInyeccion[] =
  ['MONTAJE', 'INYECCION', 'FINIZAJE', 'IMPACTO'];

export const LABEL_SUBPASO_INYECCION: Record<SubPasoInyeccion, string> = {
  MONTAJE: 'Montaje',
  INYECCION: 'Inyección',
  FINIZAJE: 'Finizaje',
  IMPACTO: 'Impacto',
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

/**
 * Etiqueta del próximo paso real: sub-paso si está dentro de una célula que los
 * tiene (Guarnición o Inyección), célula si no. null = no hay próximo (PT).
 */
export function siguientePasoLabel(
  celula: Celula,
  subPaso: SubPasoGuarnicion | null,
  subPasoInyeccion: SubPasoInyeccion | null = null,
): string | null {
  if (celula === 'GUARNICION' && subPaso) {
    const i = ORDEN_SUBPASOS.indexOf(subPaso);
    if (i < ORDEN_SUBPASOS.length - 1) return LABEL_SUBPASO[ORDEN_SUBPASOS[i + 1]];
    return LABEL_CELULA['ALMACEN']; // desde AMARRE
  }
  if (celula === 'INYECCION' && subPasoInyeccion) {
    const i = ORDEN_SUBPASOS_INYECCION.indexOf(subPasoInyeccion);
    if (i < ORDEN_SUBPASOS_INYECCION.length - 1)
      return LABEL_SUBPASO_INYECCION[ORDEN_SUBPASOS_INYECCION[i + 1]];
    return LABEL_CELULA['PT']; // desde IMPACTO
  }
  return siguienteCelulaLabel(celula);
}

/** Dónde está el par ahora mismo, con el detalle del sub-paso si lo tiene. */
export function pasoActualLabel(
  celula: Celula,
  subPaso: SubPasoGuarnicion | null,
  subPasoInyeccion: SubPasoInyeccion | null = null,
): string {
  if (celula === 'GUARNICION' && subPaso) return `${LABEL_CELULA[celula]} · ${LABEL_SUBPASO[subPaso]}`;
  if (celula === 'INYECCION' && subPasoInyeccion)
    return `${LABEL_CELULA[celula]} · ${LABEL_SUBPASO_INYECCION[subPasoInyeccion]}`;
  return LABEL_CELULA[celula];
}

export const LABEL_ESTADO_PAR: Record<EstadoPar, string> = {
  EN_PROCESO: 'en proceso',
  TERMINADO: 'terminado',
  CANCELADO: 'cancelado',
  DADO_DE_BAJA: 'dado de baja',
};

/**
 * Consumo real de materiales de una OF: lo que el BOM decía (teórico) contra lo
 * que el almacenista entregó de verdad. La diferencia positiva es lo que se
 * gastó de más.
 */
export interface ConsumoOfLinea {
  materialId: number;
  teorico: number;
  entregado: number;
  diferencia: number;
  materialCodigo: string | null;
  materialNombre: string | null;
  unidad: string | null;
}

export interface ConsumoOf {
  ofId: number;
  consecutivo: number;
  lineas: ConsumoOfLinea[];
}
