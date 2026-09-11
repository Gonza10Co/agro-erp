import { IncidenciaPar } from './calidad.models';

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';
export type EstadoPar = 'EN_PROCESO' | 'TERMINADO' | 'CANCELADO' | 'DADO_DE_BAJA';
export type SubPasoGuarnicion = 'PREPARACION' | 'AREA' | 'ARMADO' | 'VISTAS' | 'CIERRE' | 'PREFORMADO' | 'PERFORADO' | 'REVISION' | 'STROBEL' | 'AMARRE';
export type SubPasoInyeccion = 'MONTAJE' | 'INYECCION' | 'FINIZAJE' | 'IMPACTO';
export type EstadoOF = 'ABIERTA' | 'EN_PROCESO' | 'TERMINADA' | 'ANULADA';

export interface OFGenerada {
  id: number;
  consecutivo: number;
  opId: number;
  totalPares: number;
  /** Pares programados en la OP: contra eso nacen los pares en Preparación. */
  programados?: number;
}

export interface OFListItem {
  id: number;
  consecutivo: number;
  estado: EstadoOF;
  fecha: string;
  op: { consecutivo: number };
  _count: { pares: number };
  /** Pares programados en la OP: la OF nace vacía y los pares van naciendo en Preparación. */
  programados: number;
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

/** Lo programado por producto × talla contra lo que va naciendo y terminando. */
export interface ProgramaOfLinea {
  productoConfiguradoId: number;
  producto: string;
  productoCodigo: string;
  tallaId: number;
  talla: string;
  programado: number;
  nacidos: number;
  terminados: number;
}

export interface OFDetalle {
  id: number;
  consecutivo: number;
  estado: EstadoOF;
  fecha: string;
  op: { consecutivo: number };
  pares: OFDetallePar[];
  programa?: ProgramaOfLinea[];
}

/**
 * El tablero en números: la planta mueve ~1.206 pares al día, no caben en una lista.
 * Las columnas son ESTACIONES (lo que la planta reconoce), no células.
 */
export interface TableroResumen {
  estaciones: {
    codigo: string;
    nombre: string;
    total: number;
    tallas: { talla: number; cantidad: number }[];
  }[];
  terminados: number;
  fueraDeFlujo: number;
  total: number;
  /** Pares programados en la OP: contra eso se mide lo que falta por nacer. */
  programado: number;
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
  productoConfigurado?: {
    id: number;
    codigo?: string;
    nombreComercial?: string;
    referencia?: { codigo: string; nombreInterno: string } | null;
    marca?: { nombre: string } | null;
  } | null;
  linea?: { codigo: string; nombre: string } | null;
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

/** PREPARACION va primero: ahí queda lista la lengua, se pega el QR y nace el par. */
export const ORDEN_SUBPASOS: SubPasoGuarnicion[] =
  ['PREPARACION', 'AREA', 'ARMADO', 'VISTAS', 'CIERRE', 'PREFORMADO', 'PERFORADO', 'REVISION', 'STROBEL', 'AMARRE'];

export const LABEL_SUBPASO: Record<SubPasoGuarnicion, string> = {
  PREPARACION: 'Preparación',
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

// ───────────────────────── Estaciones del piloto (2026-09-09) ─────────────────────────

/** Punto de control donde se hace un pistolazo. Un dispositivo se amarra a una. */
export interface Estacion {
  codigo: string;
  nombre: string;
  orden: number;
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  subPasoInyeccion: SubPasoInyeccion | null;
  activa: boolean;
}

/** Lo que devuelve un pistolazo: el par actualizado + a dónde entró y cuántos van hoy. */
export interface AvanceResultado {
  id: number;
  codigo: string;
  celulaActual: Celula;
  estado: EstadoPar;
  avance: { estacion: string; nombre: string; terminado: boolean; hoy: number };
}

/** Lo que va impreso en la etiqueta de la lengua. */
export interface ParNacido {
  id: number;
  codigo: string;
  talla: string;
  producto: string;
  productoCodigo: string;
  referencia: string;
  marca: string;
  linea: string;
  of: number;
}

export interface NacerResultado {
  estacion: Estacion;
  hoy: number;
  pares: ParNacido[];
}

/** TV de planta: entradas de hoy por estación contra la meta del día. */
export interface HoyEstacion {
  codigo: string;
  nombre: string;
  celula: Celula;
  hoy: number;
  ultimaHora: number;
  meta: number;
}
export interface HoyPlanta {
  fecha: string;
  actualizado: string;
  estaciones: HoyEstacion[];
}

/** Tablero por órdenes: una fila por OF viva, una columna por estación activa. */
export interface OrdenTablero {
  id: number;
  consecutivo: number;
  estado: EstadoOF;
  fecha: string;
  op: number | null;
  oc: number | null;
  cliente: string | null;
  linea: string | null;
  productos: string[];
  programado: number;
  nacidos: number;
  terminados: number;
  /** Pares que ya pasaron por cada estación activa (código → cantidad). */
  porEstacion: Record<string, number | undefined>;
  programa: ProgramaOfLinea[];
}
export interface TableroOrdenes {
  estaciones: Estacion[];
  ordenes: OrdenTablero[];
}
