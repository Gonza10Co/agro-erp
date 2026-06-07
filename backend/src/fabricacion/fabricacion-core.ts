import { Celula } from '@prisma/client';

/** Orden físico de las células por las que viaja un par. */
export const ORDEN_CELULAS: Celula[] = [
  'CORTE',
  'GUARNICION',
  'ALMACEN',
  'INYECCION',
  'PT',
];

/** Devuelve la célula siguiente, o null si `actual` es la última (PT). */
export function siguienteCelula(actual: Celula): Celula | null {
  const i = ORDEN_CELULAS.indexOf(actual);
  if (i < 0 || i >= ORDEN_CELULAS.length - 1) return null;
  return ORDEN_CELULAS[i + 1];
}

/** True si la célula es la última del flujo (PT). */
export function esUltimaCelula(c: Celula): boolean {
  return siguienteCelula(c) === null;
}

/** Línea de producción pendiente de la OP (lo que hay que fabricar). */
export interface LineaProduccion {
  productoConfiguradoId: number;
  tallaId: number;
  cantAProducir: number;
}

/** Par a materializar (lo que va a la tabla Par, sin ofId). */
export interface ParData {
  codigo: string;
  productoConfiguradoId: number;
  tallaId: number;
}

/**
 * Materializa un Par por cada unidad de `cantAProducir`.
 * Código: `OF{consecutivo}-{seq}` con seq incremental global (4 dígitos) desde 1.
 * Ignora líneas con cantAProducir <= 0.
 */
export function generarPares(
  consecutivoOF: number,
  lineas: LineaProduccion[],
): ParData[] {
  const out: ParData[] = [];
  let seq = 0;
  for (const l of lineas) {
    for (let i = 0; i < l.cantAProducir; i++) {
      seq++;
      out.push({
        codigo: `OF${consecutivoOF}-${String(seq).padStart(4, '0')}`,
        productoConfiguradoId: l.productoConfiguradoId,
        tallaId: l.tallaId,
      });
    }
  }
  return out;
}
