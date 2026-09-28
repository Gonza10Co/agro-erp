import {
  CatalogoAjusteMp,
  FilaAjusteMpEntrada,
  aDiezmilesimas,
  aTextoDecimal,
  decimalADiezmilesimas,
  resolverFilasAjusteMp,
  resumirAjusteMp,
} from './ajuste-mp-core';

function catalogo(): CatalogoAjusteMp {
  return {
    materiales: new Map([
      ['CUERO-01', { id: 1, nombre: 'Cuero graso negro', unidad: 'DM2', activo: true }],
      ['HILO-02', { id: 2, nombre: 'Hilo nylon', unidad: 'M', activo: true }],
      ['VIEJO-09', { id: 9, nombre: 'Material viejo', unidad: 'UND', activo: false }],
    ]),
    // En diezmilésimas: 20,5 disponible y 8,25 reservado.
    saldos: new Map([[1, { disponible: 205000, reservado: 82500 }]]),
  };
}

const fila = (over: Partial<FilaAjusteMpEntrada> = {}): FilaAjusteMpEntrada => ({
  fila: 2,
  codigo: 'CUERO-01',
  conteo: 25.75,
  ...over,
});

describe('conversión a diezmilésimas', () => {
  it('convierte sin errores de coma flotante', () => {
    expect(aDiezmilesimas(0.1)).toBe(1000);
    expect(aDiezmilesimas(12.5)).toBe(125000);
    expect(aDiezmilesimas(1234.5678)).toBe(12345678);
    expect(aDiezmilesimas(0.1 + 0.2)).toBeNull(); // 0.30000000000000004: más de 4 decimales
    expect(aDiezmilesimas(1.23456)).toBeNull();
    expect(aDiezmilesimas(1e-7)).toBeNull();
  });

  it('lee el Decimal de Prisma por texto y lo devuelve exacto', () => {
    expect(decimalADiezmilesimas('20.5')).toBe(205000);
    expect(decimalADiezmilesimas({ toString: () => '0.0001' })).toBe(1);
    expect(decimalADiezmilesimas(null)).toBe(0);
    expect(aTextoDecimal(205000)).toBe('20.5000');
    expect(aTextoDecimal(1)).toBe('0.0001');
  });
});

describe('resolverFilasAjusteMp', () => {
  it('fija el saldo con decimales: la diferencia es conteo menos lo disponible', () => {
    const [r] = resolverFilasAjusteMp([fila()], catalogo());
    expect(r.error).toBeNull();
    expect(r).toMatchObject({ actual: 20.5, reservado: 8.25, diferencia: 5.25, material: 'Cuero graso negro', unidad: 'DM2' });
    expect(r.ids).toEqual({
      materialId: 1,
      existe: true,
      actualDz: 205000,
      reservadoDz: 82500,
      conteoDz: 257500,
      diferenciaDz: 52500,
    });
  });

  it('resta exacto donde el float fallaría (0,3 − 0,1)', () => {
    const cat = catalogo();
    cat.saldos.set(2, { disponible: 1000, reservado: 0 });
    const [r] = resolverFilasAjusteMp([fila({ codigo: 'HILO-02', conteo: 0.3 })], cat);
    expect(r.diferencia).toBe(0.2);
    expect(r.ids?.diferenciaDz).toBe(2000);
  });

  it('un material sin saldo cuenta como cero y se marca para crearlo', () => {
    const [r] = resolverFilasAjusteMp([fila({ codigo: ' HILO-02 ', conteo: 12 })], catalogo());
    expect(r).toMatchObject({ actual: 0, diferencia: 12, error: null });
    expect(r.ids?.existe).toBe(false);
  });

  it('rechaza un conteo menor que lo reservado para pedidos', () => {
    const [r] = resolverFilasAjusteMp([fila({ conteo: 8 })], catalogo());
    expect(r.error).toMatch(/8,25 DM2 reservados/);
    expect(r.ids).toBeUndefined();
  });

  it.each([
    [{ codigo: 'NO-EXISTE' }, /NO-EXISTE no existe/],
    [{ codigo: 'VIEJO-09' }, /VIEJO-09 está inactivo/],
    [{ conteo: -1 }, /cero o mayor/],
    [{ conteo: NaN }, /cero o mayor/],
    [{ conteo: 2.12345 }, /máximo 4 decimales/],
    [{ conteo: 1e15 }, /demasiado grande/],
  ])('marca el error de la fila %o', (over, error) => {
    const [r] = resolverFilasAjusteMp([fila(over)], catalogo());
    expect(r.error).toMatch(error);
  });

  it('marca el material repetido con el número de la primera fila', () => {
    const [, r] = resolverFilasAjusteMp([fila(), fila({ fila: 7, conteo: 30 })], catalogo());
    expect(r.error).toMatch(/fila 2/);
  });
});

describe('resumirAjusteMp', () => {
  it('cuenta filas que suben, bajan, quedan igual y las cantidades que mueven', () => {
    const cat = catalogo();
    cat.saldos = new Map([
      [1, { disponible: 205000, reservado: 0 }],
      [2, { disponible: 3000, reservado: 0 }],
    ]);
    const filas = resolverFilasAjusteMp(
      [
        fila({ conteo: 20.6 }),
        fila({ fila: 3, codigo: 'HILO-02', conteo: 0.1 }),
        fila({ fila: 4, codigo: 'X' }),
      ],
      cat,
    );
    expect(resumirAjusteMp(filas)).toEqual({
      filas: 3,
      errores: 1,
      sinCambio: 0,
      suben: 1,
      bajan: 1,
      cantidadEntra: 0.1,
      cantidadSale: 0.2,
    });
  });
});
