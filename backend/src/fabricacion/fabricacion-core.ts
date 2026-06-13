import { Celula, SubPasoGuarnicion } from '@prisma/client';

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
  if (i < 0) throw new Error(`Célula desconocida: "${actual}"`);
  if (i >= ORDEN_CELULAS.length - 1) return null;
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

export const ORDEN_SUBPASOS: SubPasoGuarnicion[] =
  ['AREA', 'ARMADO', 'VISTAS', 'CIERRE', 'PREFORMADO', 'PERFORADO', 'REVISION', 'STROBEL', 'AMARRE'];

export interface EstadoPar {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
}

/** Única fuente de verdad de la transición (celula, subPaso). null = terminado (sale de PT). */
export function siguienteEstado(e: EstadoPar): EstadoPar | null {
  if (e.celula === 'GUARNICION') {
    const i = ORDEN_SUBPASOS.indexOf(e.subPaso!);
    if (i < 0) throw new Error(`Sub-paso desconocido: "${e.subPaso}"`);
    if (i < ORDEN_SUBPASOS.length - 1) return { celula: 'GUARNICION', subPaso: ORDEN_SUBPASOS[i + 1] };
    return { celula: 'ALMACEN', subPaso: null }; // desde AMARRE: sale la capellada
  }
  const sig = siguienteCelula(e.celula); // reusa la cadena célula existente (lanza ante célula desconocida)
  if (sig === null) return null;
  if (sig === 'GUARNICION') return { celula: 'GUARNICION', subPaso: 'AREA' };
  return { celula: sig, subPaso: null };
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
