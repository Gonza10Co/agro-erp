import { armarEtiquetas, posicionEtiqueta, GRILLA, POR_PAGINA } from './of-etiquetas.util';
import { OFDetalle } from '../../core/api/models/fabricacion.models';

function ofCon(pares: Partial<OFDetalle['pares'][number]>[]): OFDetalle {
  return {
    id: 1,
    consecutivo: 48,
    estado: 'ABIERTA',
    fecha: '2026-07-12',
    op: { consecutivo: 100 },
    pares: pares.map((p, i) => ({
      id: i + 1,
      codigo: `OF48-000${i + 1}`,
      celulaActual: 'INYECCION',
      estado: 'EN_PROCESO',
      talla: { valor: '40' },
      productoConfigurado: { codigo: 'BD', nombreComercial: 'Bota Dieléctrica' },
      linea: { codigo: 'FEROZ', nombre: 'Feroz' },
      ...p,
    })) as OFDetalle['pares'],
  };
}

describe('armarEtiquetas', () => {
  it('arma una etiqueta por par con producto, talla y línea', () => {
    const e = armarEtiquetas(ofCon([{}]));
    expect(e).toEqual([
      { codigo: 'OF48-0001', producto: 'Bota Dieléctrica', talla: '40', linea: 'Feroz' },
    ]);
  });

  it('excluye pares dados de baja y cancelados (no viajan por planta)', () => {
    const e = armarEtiquetas(ofCon([{}, { estado: 'DADO_DE_BAJA' }, { estado: 'CANCELADO' }]));
    expect(e.length).toBe(1);
  });

  it('tolera pares sin producto o sin línea (datos históricos)', () => {
    const e = armarEtiquetas(ofCon([{ productoConfigurado: null, linea: null }]));
    expect(e[0].producto).toBe('');
    expect(e[0].linea).toBe('');
  });
});

describe('posicionEtiqueta', () => {
  it('recorre la grilla por filas: la etiqueta 0 arriba a la izquierda, la 3 abre fila', () => {
    expect(posicionEtiqueta(0)).toEqual({ pagina: 0, x: GRILLA.margenX, y: GRILLA.margenY });
    expect(posicionEtiqueta(2).x).toBeCloseTo(GRILLA.margenX + 2 * GRILLA.ancho);
    expect(posicionEtiqueta(3)).toEqual({
      pagina: 0,
      x: GRILLA.margenX,
      y: GRILLA.margenY + GRILLA.alto,
    });
  });

  it('salta de página al llenar las 24 celdas', () => {
    expect(posicionEtiqueta(POR_PAGINA - 1).pagina).toBe(0);
    expect(posicionEtiqueta(POR_PAGINA)).toEqual({
      pagina: 1,
      x: GRILLA.margenX,
      y: GRILLA.margenY,
    });
  });

  it('la grilla queda centrada dentro de la hoja carta', () => {
    // 3 columnas de 66 + márgenes = 215.9 y 8 filas de 32 + márgenes = 279.4
    expect(GRILLA.margenX * 2 + GRILLA.cols * GRILLA.ancho).toBeCloseTo(215.9);
    expect(GRILLA.margenY * 2 + GRILLA.filas * GRILLA.alto).toBeCloseTo(279.4);
  });
});
