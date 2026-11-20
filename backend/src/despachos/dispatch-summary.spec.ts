import { dispatchSummary } from './dispatch-summary';

const talla = (cantAProducir: number, dispatched: number, extra: any = {}) => ({
  cantAmarrada: 0, cantAProducir, reassignedOut: 0, dispatched, ...extra,
});

describe('dispatchSummary', () => {
  it('OP abierta con algo despachado = parcial, con entregas y pares', () => {
    const r = dispatchSummary({
      estado: 'EN_PRODUCCION',
      _count: { despachos: 2 },
      lineas: [{ tallas: [talla(20, 12), talla(10, 0)] }],
    });
    expect(r).toEqual({ deliveries: 2, dispatchedPairs: 12, neededPairs: 30, partial: true });
  });

  it('sin nada despachado no es parcial', () => {
    expect(dispatchSummary({ estado: 'AMARRADA', _count: { despachos: 0 }, lineas: [{ tallas: [talla(5, 0)] }] }).partial).toBe(false);
  });

  it('despachada completa o anulada no es parcial aunque haya salido algo', () => {
    const lineas = [{ tallas: [talla(5, 5)] }];
    expect(dispatchSummary({ estado: 'DESPACHADA', _count: { despachos: 3 }, lineas }).partial).toBe(false);
    expect(dispatchSummary({ estado: 'ANULADA', _count: { despachos: 1 }, lineas }).partial).toBe(false);
  });

  it('la necesidad descuenta lo cedido a otro pedido', () => {
    const r = dispatchSummary({ estado: 'EN_PRODUCCION', lineas: [{ tallas: [talla(20, 4, { reassignedOut: 5, cantAmarrada: 2 })] }] });
    expect(r).toEqual({ deliveries: 0, dispatchedPairs: 4, neededPairs: 17, partial: true });
  });
});
