import { WipCatalog, buildWipDetailRows } from './wip-detail-core';

const cat: WipCatalog = {
  productos: new Map([
    [1, { codigo: 'PC-1', nombre: 'Bota 101', referencia: '101', marca: 'AGRO' }],
    [2, { codigo: 'PC-2', nombre: 'Bota 102', referencia: '102', marca: 'FEROZ' }],
  ]),
  tallas: new Map([[10, 38], [11, 40]]),
  lineas: new Map([[4, 'Feroz']]),
  ofs: new Map([[5, 19], [6, 20]]),
};

const g = (o: Partial<Parameters<typeof buildWipDetailRows>[0][number]> & { n: number }) => ({
  celulaActual: 'CORTE', productoConfiguradoId: 1, tallaId: 10, lineaId: null, ofId: 5, calidad: 'PRIMERA' as const,
  _count: { _all: o.n }, ...o,
});

describe('buildWipDetailRows', () => {
  it('resuelve nombres y ordena por flujo de planta, OF y talla', () => {
    const rows = buildWipDetailRows(
      [
        g({ celulaActual: 'INYECCION', productoConfiguradoId: 2, lineaId: 4, n: 3 }),
        g({ celulaActual: 'CORTE', ofId: 6, n: 5 }),
        g({ celulaActual: 'CORTE', tallaId: 11, n: 7 }),
        g({ celulaActual: 'CORTE', n: 1 }),
      ],
      cat,
    );
    expect(rows.map((r) => [r.celula, r.of, r.talla, r.pares])).toEqual([
      ['CORTE', 19, 38, 1],
      ['CORTE', 19, 40, 7],
      ['CORTE', 20, 38, 5],
      ['INYECCION', 19, 38, 3],
    ]);
    expect(rows[3]).toMatchObject({ linea: 'Feroz', referencia: '102', marca: 'FEROZ', codigo: 'PC-2' });
    expect(rows[0].linea).toBeNull();
  });

  it('no revienta si falta un dato del catálogo', () => {
    const [r] = buildWipDetailRows([g({ productoConfiguradoId: 99, tallaId: 99, ofId: 99, lineaId: 99, n: 2 })], cat);
    expect(r).toMatchObject({ codigo: '', talla: null, of: null, linea: null, pares: 2 });
  });
});
