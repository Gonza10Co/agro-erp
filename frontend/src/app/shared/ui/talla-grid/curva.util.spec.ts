import { totalCurva } from './curva.util';

describe('totalCurva', () => {
  it('suma las cantidades del mapa', () => {
    expect(totalCurva({ 1: 10, 2: 5, 3: 0 })).toBe(15);
  });
  it('un mapa vacío suma 0', () => {
    expect(totalCurva({})).toBe(0);
  });
});
