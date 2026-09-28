import {
  CatalogoAjuste,
  FilaAjusteEntrada,
  claveSaldo,
  resolverFilasAjuste,
  resumirAjuste,
} from './ajuste-pt-core';

function catalogo(): CatalogoAjuste {
  return {
    productos: new Map([
      ['101-PODEROSA', { id: 1, nombre: 'Bota Poderosa', tallaMin: 36, tallaMax: 44 }],
    ]),
    tallas: new Map([
      [34, 10],
      [38, 14],
      [40, 16],
    ]),
    bodegas: new Map([['IBG', 5]]),
    saldos: new Map([[claveSaldo(1, 14, 5, 'PRIMERA'), { disponible: 20, reservado: 8 }]]),
  };
}

const fila = (over: Partial<FilaAjusteEntrada> = {}): FilaAjusteEntrada => ({
  fila: 2,
  codigo: '101-PODEROSA',
  talla: 38,
  bodega: 'IBG',
  calidad: 'PRIMERA',
  conteo: 25,
  ...over,
});

describe('resolverFilasAjuste', () => {
  it('fija el saldo: la diferencia es conteo menos lo disponible', () => {
    const [r] = resolverFilasAjuste([fila()], catalogo());
    expect(r.error).toBeNull();
    expect(r).toMatchObject({ actual: 20, reservado: 8, diferencia: 5, producto: 'Bota Poderosa' });
    expect(r.ids).toEqual({ productoConfiguradoId: 1, tallaId: 14, bodegaId: 5, calidad: 'PRIMERA' });
  });

  it('un saldo que no existe cuenta como cero', () => {
    const [r] = resolverFilasAjuste([fila({ talla: 40, conteo: 12 })], catalogo());
    expect(r).toMatchObject({ actual: 0, diferencia: 12, error: null });
  });

  it('normaliza bodega y calidad, y la calidad vacía es PRIMERA', () => {
    const [r] = resolverFilasAjuste([fila({ bodega: ' ibg ', calidad: '' })], catalogo());
    expect(r.error).toBeNull();
    expect(r.calidad).toBe('PRIMERA');
  });

  it('rechaza un conteo menor que lo reservado para pedidos', () => {
    const [r] = resolverFilasAjuste([fila({ conteo: 5 })], catalogo());
    expect(r.error).toMatch(/8 pares reservados/);
    expect(r.ids).toBeUndefined();
  });

  it.each([
    [{ codigo: 'NO-EXISTE' }, /no existe o está inactivo/],
    [{ talla: 99 }, /talla 99 no existe/],
    [{ talla: 34 }, /fuera del rango de la referencia \(36 a 44\)/],
    [{ bodega: 'BOG' }, /bodega BOG no existe/],
    [{ calidad: 'TERCERA' }, /Calidad "TERCERA" no válida/],
    [{ conteo: -1 }, /entero, cero o mayor/],
    [{ conteo: 2.5 }, /entero, cero o mayor/],
  ])('marca el error de la fila %o', (over, error) => {
    const [r] = resolverFilasAjuste([fila(over)], catalogo());
    expect(r.error).toMatch(error);
  });

  it('marca la fila repetida con el número de la primera', () => {
    const [, r] = resolverFilasAjuste([fila(), fila({ fila: 7, conteo: 30 })], catalogo());
    expect(r.error).toMatch(/fila 2/);
  });
});

describe('resumirAjuste', () => {
  it('cuenta filas que suben, bajan, quedan igual y los pares que mueven', () => {
    const filas = resolverFilasAjuste(
      [
        fila({ conteo: 25 }),
        fila({ fila: 3, talla: 40, conteo: 0 }),
        fila({ fila: 4, calidad: 'SEGUNDA', conteo: 0 }),
        fila({ fila: 5, codigo: 'X' }),
      ],
      {
        ...catalogo(),
        saldos: new Map([
          [claveSaldo(1, 14, 5, 'PRIMERA'), { disponible: 20, reservado: 0 }],
          [claveSaldo(1, 14, 5, 'SEGUNDA'), { disponible: 3, reservado: 0 }],
        ]),
      },
    );
    expect(resumirAjuste(filas)).toEqual({
      filas: 4,
      errores: 1,
      sinCambio: 1,
      suben: 1,
      bajan: 1,
      paresEntran: 5,
      paresSalen: 3,
    });
  });
});
