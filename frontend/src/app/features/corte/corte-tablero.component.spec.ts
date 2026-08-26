import { cumplimientoMedible } from './corte-tablero.component';

describe('cumplimientoMedible', () => {
  it('no mide el cumplimiento de una orden que apenas está programada', () => {
    // El backend calcula 0/820 = 0. Pintarlo como "0%" en rojo acusa a una
    // orden a la que todavía nadie le ha puesto tijera.
    expect(cumplimientoMedible('PROGRAMADA', 0)).toBeNull();
  });

  it('tampoco mientras corte la está trabajando: lo cortado se reporta al entregar', () => {
    expect(cumplimientoMedible('EN_CORTE', 0)).toBeNull();
  });

  it('sí lo mide desde que corte entregó', () => {
    expect(cumplimientoMedible('ENTREGADA', 0.62)).toBeCloseTo(0.62, 5);
    expect(cumplimientoMedible('EN_GUARNICION', 1)).toBe(1);
    expect(cumplimientoMedible('CERRADA', 0.983)).toBeCloseTo(0.983, 5);
  });

  it('respeta el null que ya venía del backend', () => {
    expect(cumplimientoMedible('CERRADA', null)).toBeNull();
  });
});
