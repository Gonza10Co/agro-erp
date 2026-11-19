import { planMove, planShiftToStock } from './pt-reassignment-core';

describe('planMove: de qué reservas de A salen los pares y a qué talla de B llegan', () => {
  const reservasA = [
    { reservaId: 1, opLineaTallaId: 10, inventarioPTId: 100, cantidad: 4, prioridad: 20 },
    { reservaId: 2, opLineaTallaId: 10, inventarioPTId: 200, cantidad: 6, prioridad: 10 },
  ];

  it('toma primero de la bodega principal (menor prioridad), igual que el amarre', () => {
    const p = planMove(reservasA, null, 7);
    expect(p.takes).toEqual([
      { reservaId: 2, opLineaTallaId: 10, inventarioPTId: 200, cantidad: 6 },
      { reservaId: 1, opLineaTallaId: 10, inventarioPTId: 100, cantidad: 1 },
    ]);
    expect(p.gives).toEqual([]);
  });

  it('la reserva de B queda sobre la MISMA fila de inventario: los pares no cambian de bodega', () => {
    const p = planMove(reservasA, [{ opLineaTallaId: 50, pending: 8 }], 7);
    expect(p.gives).toEqual([
      { opLineaTallaId: 50, inventarioPTId: 200, cantidad: 6 },
      { opLineaTallaId: 50, inventarioPTId: 100, cantidad: 1 },
    ]);
  });

  it('si B tiene la talla repartida en dos líneas, llena lo pendiente de cada una en orden', () => {
    const p = planMove(reservasA, [{ opLineaTallaId: 50, pending: 2 }, { opLineaTallaId: 51, pending: 5 }], 7);
    expect(p.gives).toEqual([
      { opLineaTallaId: 50, inventarioPTId: 200, cantidad: 2 },
      { opLineaTallaId: 51, inventarioPTId: 200, cantidad: 4 },
      { opLineaTallaId: 51, inventarioPTId: 100, cantidad: 1 },
    ]);
  });

  it('no saca más de lo que A tiene reservado', () => {
    expect(() => planMove(reservasA, null, 11)).toThrow(/10/);
  });

  it('no le pasa a B más de lo que le falta', () => {
    expect(() => planMove(reservasA, [{ opLineaTallaId: 50, pending: 3 }], 4)).toThrow(/3/);
  });

  it('la cantidad es un entero positivo', () => {
    expect(() => planMove(reservasA, null, 0)).toThrow();
    expect(() => planMove(reservasA, null, 1.5)).toThrow();
  });
});

describe('planShiftToStock: B deja de programar lo que recibió hecho', () => {
  it('pasa de "a producir" a "amarrado" lo recibido, si nada de eso ha nacido', () => {
    expect(planShiftToStock([{ id: 50, cantAProducir: 20 }], 0, 8)).toEqual([{ id: 50, cantidad: 8 }]);
  });

  it('no baja lo programado por debajo de lo que ya nació en planta', () => {
    // 20 programados, 15 ya nacieron: solo quedan 5 por nacer que se pueden des-programar.
    expect(planShiftToStock([{ id: 50, cantAProducir: 20 }], 15, 8)).toEqual([{ id: 50, cantidad: 5 }]);
  });

  it('sin nada a producir (pedido servido de bodega o de segundas) no cambia nada', () => {
    expect(planShiftToStock([{ id: 50, cantAProducir: 0 }], 0, 8)).toEqual([]);
  });

  it('reparte entre líneas sin dejar ninguna negativa', () => {
    expect(planShiftToStock([{ id: 50, cantAProducir: 3 }, { id: 51, cantAProducir: 10 }], 0, 8)).toEqual([
      { id: 50, cantidad: 3 },
      { id: 51, cantidad: 5 },
    ]);
  });
});
