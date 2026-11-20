import { closesOp, DispatchError, planDispatch, TallaDespachable } from './dispatch-plan';

function talla(over: Partial<TallaDespachable> = {}): TallaDespachable {
  return {
    opLineaTallaId: 30,
    productoConfiguradoId: 7,
    tallaId: 10,
    cantAmarrada: 0,
    cantAProducir: 20,
    reassignedOut: 0,
    dispatched: 0,
    reservas: [
      { reservaId: 100, inventarioPTId: 50, bodegaId: 2, prioridad: 1, calidad: 'PRIMERA', cantidad: 12 },
    ],
    ...over,
  };
}

describe('planDispatch (despacho parcial)', () => {
  it('sin lines sale todo lo reservado', () => {
    const plan = planDispatch([talla()]);
    expect(plan.total).toBe(12);
    expect(plan.takes).toEqual([
      expect.objectContaining({ reservaId: 100, inventarioPTId: 50, cantidad: 12, reservaCantidad: 12 }),
    ]);
    // Pedido de 20 con 12 en bodega: no cierra.
    expect(plan.closesOp).toBe(false);
  });

  it('con lines sale solo lo pedido y la reserva queda con el resto', () => {
    const plan = planDispatch([talla()], [{ opLineaTallaId: 30, quantity: 5 }]);
    expect(plan.total).toBe(5);
    expect(plan.perTalla.get(30)).toBe(5);
    expect(plan.takes).toEqual([expect.objectContaining({ reservaId: 100, cantidad: 5, reservaCantidad: 12 })]);
    expect(plan.closesOp).toBe(false);
  });

  it('dentro de la talla consume primero la bodega principal y ordena por inventario (locks)', () => {
    const t = talla({
      reservas: [
        { reservaId: 101, inventarioPTId: 40, bodegaId: 3, prioridad: 5, calidad: 'PRIMERA', cantidad: 6 },
        { reservaId: 100, inventarioPTId: 50, bodegaId: 2, prioridad: 1, calidad: 'PRIMERA', cantidad: 4 },
      ],
    });
    const plan = planDispatch([t], [{ opLineaTallaId: 30, quantity: 7 }]);
    // 4 de la principal (prioridad 1) + 3 de la otra; el orden final es por inventarioPTId.
    expect(plan.takes.map((x) => [x.inventarioPTId, x.cantidad])).toEqual([[40, 3], [50, 4]]);
  });

  it('no deja despachar más de lo reservado', () => {
    expect(() => planDispatch([talla()], [{ opLineaTallaId: 30, quantity: 13 }])).toThrow(/solo hay 12 pares reservados/);
  });

  it('rechaza tallas ajenas, repetidas, negativas y un despacho vacío', () => {
    expect(() => planDispatch([talla()], [{ opLineaTallaId: 99, quantity: 1 }])).toThrow(DispatchError);
    expect(() =>
      planDispatch([talla()], [{ opLineaTallaId: 30, quantity: 1 }, { opLineaTallaId: 30, quantity: 1 }]),
    ).toThrow(/repetida/);
    expect(() => planDispatch([talla()], [{ opLineaTallaId: 30, quantity: -1 }])).toThrow(DispatchError);
    expect(() => planDispatch([talla()], [{ opLineaTallaId: 30, quantity: 0 }])).toThrow(/al menos un par/);
    expect(() => planDispatch([talla({ reservas: [] })])).toThrow(/no tiene pares reservados/);
  });

  it('cierra cuando lo despachado antes más lo de ahora cubre la necesidad de cada talla', () => {
    const a = talla({ dispatched: 8, reservas: [{ reservaId: 100, inventarioPTId: 50, bodegaId: 2, prioridad: 1, calidad: 'PRIMERA', cantidad: 12 }] });
    const b = talla({ opLineaTallaId: 31, tallaId: 11, cantAProducir: 5, dispatched: 5, reservas: [] });
    expect(planDispatch([a, b]).closesOp).toBe(true);
    expect(planDispatch([a, b], [{ opLineaTallaId: 30, quantity: 11 }]).closesOp).toBe(false);
  });

  it('lo cedido a otro pedido no hay que despacharlo (necesidad = amarrado + a producir − cedido)', () => {
    expect(closesOp([talla({ cantAProducir: 25, reassignedOut: 5, dispatched: 20 })])).toBe(true);
    expect(closesOp([talla({ cantAProducir: 25, reassignedOut: 5, dispatched: 19 })])).toBe(false);
  });
});
