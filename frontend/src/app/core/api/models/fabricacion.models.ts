export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';
export type EstadoPar = 'EN_PROCESO' | 'TERMINADO';
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
  estado: EstadoPar;
  talla: { valor: string };
  of: { consecutivo: number };
}

export interface EventoTrazabilidad {
  id: number;
  celula: Celula;
  timestamp: string;
  operario: { nombre: string };
  maquina: { nombre: string };
}

export interface ParDetalle {
  id: number;
  codigo: string;
  celulaActual: Celula;
  estado: EstadoPar;
  of: { consecutivo: number };
  talla: { valor: string };
  eventos: EventoTrazabilidad[];
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
