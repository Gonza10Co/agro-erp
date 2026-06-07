import {
  ORDEN_CELULAS,
  siguienteCelula,
  esUltimaCelula,
  generarPares,
  LineaProduccion,
} from './fabricacion-core';

describe('siguienteCelula', () => {
  it('avanza en orden CORTE→GUARNICION→ALMACEN→INYECCION→PT', () => {
    expect(siguienteCelula('CORTE')).toBe('GUARNICION');
    expect(siguienteCelula('GUARNICION')).toBe('ALMACEN');
    expect(siguienteCelula('ALMACEN')).toBe('INYECCION');
    expect(siguienteCelula('INYECCION')).toBe('PT');
  });

  it('PT no tiene siguiente (null)', () => {
    expect(siguienteCelula('PT')).toBeNull();
  });

  it('expone el orden completo de 5 células', () => {
    expect(ORDEN_CELULAS).toEqual(['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT']);
  });

  it('lanza error ante una célula desconocida (no la trata como PT)', () => {
    expect(() => siguienteCelula('XXX' as never)).toThrow('Célula desconocida');
  });
});

describe('esUltimaCelula', () => {
  it('solo PT es la última', () => {
    expect(esUltimaCelula('PT')).toBe(true);
    expect(esUltimaCelula('CORTE')).toBe(false);
    expect(esUltimaCelula('INYECCION')).toBe(false);
  });
});

describe('generarPares', () => {
  const lineas: LineaProduccion[] = [
    { productoConfiguradoId: 10, tallaId: 1, cantAProducir: 2 },
    { productoConfiguradoId: 10, tallaId: 2, cantAProducir: 1 },
  ];

  it('genera un par por unidad de cantAProducir', () => {
    const pares = generarPares(5, lineas);
    expect(pares).toHaveLength(3);
  });

  it('asigna códigos únicos y bien formados OF{consecutivo}-{seq:0000}', () => {
    const pares = generarPares(5, lineas);
    expect(pares.map((p) => p.codigo)).toEqual([
      'OF5-0001',
      'OF5-0002',
      'OF5-0003',
    ]);
    expect(new Set(pares.map((p) => p.codigo)).size).toBe(3);
  });

  it('mapea producto y talla de cada línea', () => {
    const pares = generarPares(5, lineas);
    expect(pares[0]).toMatchObject({ productoConfiguradoId: 10, tallaId: 1 });
    expect(pares[1]).toMatchObject({ productoConfiguradoId: 10, tallaId: 1 });
    expect(pares[2]).toMatchObject({ productoConfiguradoId: 10, tallaId: 2 });
  });

  it('ignora líneas con cantAProducir <= 0', () => {
    const pares = generarPares(9, [
      { productoConfiguradoId: 1, tallaId: 1, cantAProducir: 0 },
      { productoConfiguradoId: 1, tallaId: 2, cantAProducir: 2 },
    ]);
    expect(pares).toHaveLength(2);
    expect(pares[0].codigo).toBe('OF9-0001');
  });
});
