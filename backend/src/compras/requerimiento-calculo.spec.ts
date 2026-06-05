import {
  construirLineasRequerimiento,
  agruparPorProveedor,
  LineaSalida,
} from './requerimiento-calculo';

describe('construirLineasRequerimiento', () => {
  it('neto = max(0, necesaria − disponible)', () => {
    const bruto = new Map([[1, 100], [2, 50], [3, 30]]);
    const stock = new Map([[1, 30], [2, 80]]); // mat3 sin registro
    const prov = new Map<number, number | null>([[1, 7], [2, 7], [3, null]]);

    const lineas = construirLineasRequerimiento(bruto, stock, prov);

    expect(lineas).toEqual([
      { materialId: 1, proveedorId: 7, cantNecesaria: 100, cantDisponible: 30, cantAComprar: 70 },
      { materialId: 2, proveedorId: 7, cantNecesaria: 50, cantDisponible: 80, cantAComprar: 0 },
      { materialId: 3, proveedorId: null, cantNecesaria: 30, cantDisponible: 0, cantAComprar: 30 },
    ]);
  });

  it('descarta materiales con necesaria == 0', () => {
    const lineas = construirLineasRequerimiento(
      new Map([[1, 0], [2, 5]]),
      new Map(),
      new Map<number, number | null>([[1, null], [2, null]]),
    );
    expect(lineas.map((l) => l.materialId)).toEqual([2]);
  });
});

describe('agruparPorProveedor', () => {
  const linea = (over: Partial<LineaSalida>): LineaSalida => ({
    materialId: 1, materialCodigo: 'M1', materialNombre: 'Mat 1',
    proveedorId: 7, proveedorNombre: 'Curtiembre XYZ',
    cantNecesaria: 10, cantDisponible: 0, cantAComprar: 10, ...over,
  });

  it('agrupa por proveedor y manda los sin-proveedor al final', () => {
    const grupos = agruparPorProveedor([
      linea({ materialId: 1, proveedorId: 7, proveedorNombre: 'Curtiembre XYZ' }),
      linea({ materialId: 2, proveedorId: null, proveedorNombre: null }),
      linea({ materialId: 3, proveedorId: 7, proveedorNombre: 'Curtiembre XYZ' }),
    ]);

    expect(grupos.map((g) => g.proveedor?.nombre ?? null)).toEqual([
      'Curtiembre XYZ',
      null,
    ]);
    expect(grupos[0].lineas.map((l) => l.materialId)).toEqual([1, 3]);
    expect(grupos[1].lineas.map((l) => l.materialId)).toEqual([2]);
  });
});
