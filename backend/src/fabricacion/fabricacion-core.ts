import { Celula, SubPasoGuarnicion, SubPasoInyeccion } from '@prisma/client';

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

/**
 * Sub-paso inicial al arrancar en una célula. Solo Guarnición arranca dentro de
 * un sub-paso (AREA); cualquier otro punto de entrada (CORTE, PT…) es null.
 */
export function subPasoInicial(celula: Celula): SubPasoGuarnicion | null {
  return celula === 'GUARNICION' ? 'AREA' : null;
}

/**
 * Ídem para Inyección: un par que arranca ahí (la línea Feroz, que entra a que le
 * inyecten la suela) empieza en MONTAJE.
 */
export function subPasoInyeccionInicial(celula: Celula): SubPasoInyeccion | null {
  return celula === 'INYECCION' ? 'MONTAJE' : null;
}

/** Línea de producción pendiente de la OP (lo que hay que fabricar). */
export interface LineaProduccion {
  productoConfiguradoId: number;
  tallaId: number;
  cantAProducir: number;
  /** Célula donde arranca la línea. Default CORTE; la línea Feroz entra en INYECCION. */
  celulaInicial?: Celula;
  /** Id de la línea de negocio (denormalizado en el par para reportes). Null si la marca no tiene línea. */
  lineaId?: number | null;
}

/** Par a materializar (lo que va a la tabla Par, sin ofId). */
export interface ParData {
  codigo: string;
  productoConfiguradoId: number;
  tallaId: number;
  celulaInicial: Celula;
  subPasoInicial: SubPasoGuarnicion | null;
  subPasoInyeccionInicial: SubPasoInyeccion | null;
  lineaId: number | null;
}

export const ORDEN_SUBPASOS: SubPasoGuarnicion[] =
  ['AREA', 'ARMADO', 'VISTAS', 'CIERRE', 'PREFORMADO', 'PERFORADO', 'REVISION', 'STROBEL', 'AMARRE'];

/**
 * Inyección tampoco es una sola estación (JP, 2026-07-30): montaje → inyección
 * propiamente dicha → finizaje (el acabado: crayola, gama, gardenia, lija) →
 * impacto. La salida real de la célula es el último, igual que AMARRE lo es en
 * Guarnición.
 */
export const ORDEN_SUBPASOS_INYECCION: SubPasoInyeccion[] =
  ['MONTAJE', 'INYECCION', 'FINIZAJE', 'IMPACTO'];

/** Sub-paso con el que se considera terminada la célula (el que cuenta como producción). */
export const SUBPASO_SALIDA_GUARNICION: SubPasoGuarnicion = 'AMARRE';
export const SUBPASO_SALIDA_INYECCION: SubPasoInyeccion = 'IMPACTO';

export interface EstadoPar {
  celula: Celula;
  subPaso: SubPasoGuarnicion | null;
  /** Solo en INYECCION. undefined/null en pares anteriores a los sub-pasos. */
  subPasoInyeccion?: SubPasoInyeccion | null;
}

/** Siguiente elemento de una cadena de sub-pasos, o null si `actual` es el último. */
function siguienteEnCadena<T>(orden: readonly T[], actual: T): T | null {
  const i = orden.indexOf(actual);
  if (i < 0) throw new Error(`Sub-paso desconocido: "${actual}"`);
  return i < orden.length - 1 ? orden[i + 1] : null;
}

/** Única fuente de verdad de la transición (celula, subPaso). null = terminado (sale de PT). */
export function siguienteEstado(e: EstadoPar): EstadoPar | null {
  if (e.celula === 'GUARNICION') {
    const sig = siguienteEnCadena(ORDEN_SUBPASOS, e.subPaso!);
    if (sig) return { celula: 'GUARNICION', subPaso: sig, subPasoInyeccion: null };
    return { celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null }; // desde AMARRE: sale la capellada
  }
  if (e.celula === 'INYECCION' && e.subPasoInyeccion != null) {
    const sig = siguienteEnCadena(ORDEN_SUBPASOS_INYECCION, e.subPasoInyeccion);
    if (sig) return { celula: 'INYECCION', subPaso: null, subPasoInyeccion: sig };
    return { celula: 'PT', subPaso: null, subPasoInyeccion: null }; // desde IMPACTO
  }
  // INYECCION sin sub-paso = par que entró antes de que existieran: sale a PT en
  // un solo escaneo, como venía haciéndolo. No se lo devuelve al principio de la
  // cadena, que sería hacerle repetir trabajo ya hecho en el piso.
  const sig = siguienteCelula(e.celula); // reusa la cadena célula existente (lanza ante célula desconocida)
  if (sig === null) return null;
  if (sig === 'GUARNICION') return { celula: 'GUARNICION', subPaso: 'AREA', subPasoInyeccion: null };
  if (sig === 'INYECCION')
    return { celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE' };
  return { celula: sig, subPaso: null, subPasoInyeccion: null };
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
    const celulaInicial = l.celulaInicial ?? 'CORTE';
    const subPaso = subPasoInicial(celulaInicial);
    const subPasoIny = subPasoInyeccionInicial(celulaInicial);
    for (let i = 0; i < l.cantAProducir; i++) {
      seq++;
      out.push({
        codigo: `OF${consecutivoOF}-${String(seq).padStart(4, '0')}`,
        productoConfiguradoId: l.productoConfiguradoId,
        tallaId: l.tallaId,
        celulaInicial,
        subPasoInicial: subPaso,
        subPasoInyeccionInicial: subPasoIny,
        lineaId: l.lineaId ?? null,
      });
    }
  }
  return out;
}
