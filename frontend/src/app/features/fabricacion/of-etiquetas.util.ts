import { OFDetalle } from '../../core/api/models/fabricacion.models';

/**
 * Etiquetas físicas de código de barras por par: qué se imprime y dónde cae cada
 * una en la hoja. Lógica pura (testeable); el render a PDF vive en of-etiquetas-pdf.ts.
 */

export interface EtiquetaPar {
  codigo: string; // el contenido del código de barras (la "cédula" del par)
  producto: string;
  talla: string;
  linea: string;
}

/** Hoja carta adhesiva troquelada 3×8 (24 etiquetas de 66×32 mm), medidas en mm. */
export const GRILLA = {
  cols: 3,
  filas: 8,
  ancho: 66,
  alto: 32,
  // Márgenes que centran la grilla en la carta (215.9 × 279.4 mm).
  margenX: (215.9 - 3 * 66) / 2,
  margenY: (279.4 - 8 * 32) / 2,
} as const;

export const POR_PAGINA = GRILLA.cols * GRILLA.filas;

/** Un par dado de baja o cancelado no viaja por planta: su etiqueta no se imprime. */
export function armarEtiquetas(of: OFDetalle): EtiquetaPar[] {
  return of.pares
    .filter((p) => p.estado !== 'DADO_DE_BAJA' && p.estado !== 'CANCELADO')
    .map((p) => ({
      codigo: p.codigo,
      producto: p.productoConfigurado?.nombreComercial ?? '',
      talla: String(p.talla.valor),
      linea: p.linea?.nombre ?? '',
    }));
}

/** Celda de la etiqueta i-ésima: página (base 0) y esquina superior izquierda en mm. */
export function posicionEtiqueta(i: number): { pagina: number; x: number; y: number } {
  const pagina = Math.floor(i / POR_PAGINA);
  const enPagina = i % POR_PAGINA;
  const col = enPagina % GRILLA.cols;
  const fila = Math.floor(enPagina / GRILLA.cols);
  return {
    pagina,
    x: GRILLA.margenX + col * GRILLA.ancho,
    y: GRILLA.margenY + fila * GRILLA.alto,
  };
}
