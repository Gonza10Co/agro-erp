import { deliveryLabel, dispatchDetail, partialDispatch } from './dispatch-labels';

describe('dispatch-labels', () => {
  it('nombra la entrega y marca la final', () => {
    expect(deliveryLabel(1, false)).toBe('Entrega 1');
    expect(deliveryLabel(3, true)).toBe('Entrega 3 (final)');
    expect(deliveryLabel(undefined)).toBeNull();
  });

  it('resume entregas y pares, en singular cuando es una', () => {
    expect(dispatchDetail({ deliveries: 2, dispatchedPairs: 1200, neededPairs: 2000, partial: true }))
      .toBe('2 entregas · 1.200 de 2.000 pares');
    expect(dispatchDetail({ deliveries: 1, dispatchedPairs: 5, neededPairs: 20, partial: true }))
      .toBe('1 entrega · 5 de 20 pares');
  });

  it('solo hay chip si el despacho es parcial', () => {
    expect(partialDispatch(null)).toBeNull();
    expect(partialDispatch({ deliveries: 3, dispatchedPairs: 20, neededPairs: 20, partial: false })).toBeNull();
    expect(partialDispatch({ deliveries: 1, dispatchedPairs: 5, neededPairs: 20, partial: true })?.deliveries).toBe(1);
  });
});
