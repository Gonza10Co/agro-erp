import {
  repartirDescargaDeReserva,
  consolidarConsumo,
  LineaReservaMin,
} from './consumo-of-core';

describe('repartirDescargaDeReserva', () => {
  it('descuenta el consumo de la reserva de la OP, línea por línea', () => {
    const lineas: LineaReservaMin[] = [{ id: 10, cantReservada: 30 }];

    const r = repartirDescargaDeReserva(25, lineas);

    expect(r).toEqual({ total: 25, porLinea: [{ id: 10, descontar: 25 }] });
  });

  it('consumir más de lo reservado no deja la reserva negativa: el excedente sale de stock libre', () => {
    const lineas: LineaReservaMin[] = [{ id: 10, cantReservada: 30 }];

    const r = repartirDescargaDeReserva(40, lineas);

    // Solo se liberan los 30 amarrados; los otros 10 nunca estuvieron reservados.
    expect(r).toEqual({ total: 30, porLinea: [{ id: 10, descontar: 30 }] });
  });

  it('reparte contra varias líneas en orden (una OP puede tener requerimientos recalculados)', () => {
    const lineas: LineaReservaMin[] = [
      { id: 10, cantReservada: 12 },
      { id: 11, cantReservada: 20 },
    ];

    const r = repartirDescargaDeReserva(18, lineas);

    expect(r).toEqual({
      total: 18,
      porLinea: [
        { id: 10, descontar: 12 },
        { id: 11, descontar: 6 },
      ],
    });
  });

  it('omite las líneas que no alcanza a tocar', () => {
    const lineas: LineaReservaMin[] = [
      { id: 10, cantReservada: 50 },
      { id: 11, cantReservada: 20 },
    ];

    expect(repartirDescargaDeReserva(5, lineas)).toEqual({
      total: 5,
      porLinea: [{ id: 10, descontar: 5 }],
    });
  });

  it('sin reserva viva (material comprado, no amarrado) no descuenta nada', () => {
    expect(repartirDescargaDeReserva(10, [])).toEqual({ total: 0, porLinea: [] });
    expect(repartirDescargaDeReserva(10, [{ id: 10, cantReservada: 0 }])).toEqual({
      total: 0,
      porLinea: [],
    });
  });

  it('cantidad cero o negativa no toca nada', () => {
    const lineas: LineaReservaMin[] = [{ id: 10, cantReservada: 30 }];
    expect(repartirDescargaDeReserva(0, lineas)).toEqual({ total: 0, porLinea: [] });
    expect(repartirDescargaDeReserva(-5, lineas)).toEqual({ total: 0, porLinea: [] });
  });
});

describe('consolidarConsumo', () => {
  it('cruza teórico contra entregado y saca la diferencia por material', () => {
    const teorico = new Map([
      [1, 100],
      [2, 50],
    ]);
    const entregado = new Map([
      [1, 108],
      [2, 50],
    ]);

    expect(consolidarConsumo(teorico, entregado)).toEqual([
      { materialId: 1, teorico: 100, entregado: 108, diferencia: 8 },
      { materialId: 2, teorico: 50, entregado: 50, diferencia: 0 },
    ]);
  });

  it('un material entregado que no está en el BOM aparece con teórico 0', () => {
    const teorico = new Map([[1, 10]]);
    const entregado = new Map([
      [1, 10],
      [9, 3],
    ]);

    expect(consolidarConsumo(teorico, entregado)).toEqual([
      { materialId: 1, teorico: 10, entregado: 10, diferencia: 0 },
      { materialId: 9, teorico: 0, entregado: 3, diferencia: 3 },
    ]);
  });

  it('un material del BOM que todavía no se entrega queda en diferencia negativa', () => {
    const teorico = new Map([
      [1, 10],
      [2, 4],
    ]);

    expect(consolidarConsumo(teorico, new Map([[1, 6]]))).toEqual([
      { materialId: 1, teorico: 10, entregado: 6, diferencia: -4 },
      { materialId: 2, teorico: 4, entregado: 0, diferencia: -4 },
    ]);
  });

  it('preserva el orden del BOM y deja los extras al final', () => {
    const teorico = new Map([
      [5, 1],
      [3, 1],
    ]);
    const entregado = new Map([
      [9, 1],
      [3, 1],
    ]);

    expect(consolidarConsumo(teorico, entregado).map((l) => l.materialId)).toEqual([5, 3, 9]);
  });

  it('redondea a 4 decimales, que es la escala del kardex', () => {
    const r = consolidarConsumo(new Map([[1, 0.1 + 0.2]]), new Map([[1, 0.3]]));
    expect(r[0].diferencia).toBe(0);
  });
});
