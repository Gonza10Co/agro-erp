import { needOf, pendingOf, pendingToProduce } from './op-need';

describe('needOf / pendingOf (lo que un pedido necesita de una talla)', () => {
  it('la necesidad es amarrado + a producir', () => {
    expect(needOf({ cantAmarrada: 5, cantAProducir: 15 })).toBe(20);
  });

  it('lo cedido a otro pedido se descuenta: el pedido no necesita MÁS, solo se programa de nuevo', () => {
    // Pedido de 20, todo fabricado; gerencia pasó 5 a otro pedido → se programan 25
    // pero la necesidad sigue siendo 20.
    expect(needOf({ cantAmarrada: 0, cantAProducir: 25, reassignedOut: 5 })).toBe(20);
  });

  it('lo pendiente es la necesidad menos lo reservado, nunca negativo', () => {
    expect(pendingOf({ cantAmarrada: 0, cantAProducir: 20, reservas: [{ cantidad: 12 }, { cantidad: 3 }] })).toBe(5);
    expect(pendingOf({ cantAmarrada: 2, cantAProducir: 0, reservas: [{ cantidad: 5 }] })).toBe(0);
    expect(pendingOf({ cantAmarrada: 2, cantAProducir: 3 })).toBe(5);
  });
});

describe('pendingToProduce (lo que la proyección pone a fabricar)', () => {
  it('primeras: lo pendiente por reservar', () => {
    expect(
      pendingToProduce('PRIMERA', { cantAmarrada: 0, cantAProducir: 25, reassignedOut: 5, reservas: [{ cantidad: 15 }] }),
    ).toBe(5);
  });

  it('segundas: nunca se fabrican, aunque el pedido deba pares', () => {
    expect(pendingToProduce('SEGUNDA', { cantAmarrada: 4, cantAProducir: 0, reservas: [{ cantidad: 1 }] })).toBe(0);
  });
});
