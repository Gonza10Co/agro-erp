import { diasTranscurridos, estadoDemora } from './oc-demora';

describe('diasTranscurridos', () => {
  it('cuenta días completos', () => {
    expect(
      diasTranscurridos(new Date('2026-06-08T00:00:00Z'), new Date('2026-07-08T00:00:00Z')),
    ).toBe(30);
  });

  it('nunca es negativo', () => {
    expect(diasTranscurridos(new Date('2026-07-08'), new Date('2026-07-01'))).toBe(0);
  });
});

describe('estadoDemora', () => {
  const ahora = new Date('2026-07-08T12:00:00Z');
  const conf = (d: string) => new Date(d);

  it('sin fecha de confirmación → sin semáforo', () => {
    expect(estadoDemora(null, ahora, 'AL_DIA', 'BORRADOR')).toEqual({ dias: null, estado: null });
  });

  it('una OC en BORRADOR no corre el reloj aunque tenga fecha vieja', () => {
    expect(estadoDemora(conf('2026-01-01'), ahora, 'AL_DIA', 'BORRADOR').estado).toBeNull();
  });

  it('CERRADA y ANULADA no corren el reloj', () => {
    expect(estadoDemora(conf('2026-01-01'), ahora, 'AL_DIA', 'CERRADA').estado).toBeNull();
    expect(estadoDemora(conf('2026-01-01'), ahora, 'AL_DIA', 'ANULADA').estado).toBeNull();
  });

  it('verde antes del umbral amarillo', () => {
    expect(estadoDemora(conf('2026-07-03T12:00:00Z'), ahora, 'AL_DIA', 'CONFIRMADA')).toEqual({
      dias: 5,
      estado: 'VERDE',
    });
  });

  it('amarillo justo a los 20 días', () => {
    const r = estadoDemora(conf('2026-06-18T12:00:00Z'), ahora, 'AL_DIA', 'CONFIRMADA');
    expect(r).toEqual({ dias: 20, estado: 'AMARILLO' });
  });

  it('rojo a los 30 días (incluso EN_PRODUCCION)', () => {
    const r = estadoDemora(conf('2026-06-08T12:00:00Z'), ahora, 'AL_DIA', 'EN_PRODUCCION');
    expect(r).toEqual({ dias: 30, estado: 'ROJO' });
  });

  it('cliente VENCIDO → retenida por cartera, no roja (pero se ven los días)', () => {
    const r = estadoDemora(conf('2026-06-08T12:00:00Z'), ahora, 'VENCIDO', 'CONFIRMADA');
    expect(r).toEqual({ dias: 30, estado: 'RETENIDA_CARTERA' });
  });

  it('cliente BLOQUEADO también queda retenido', () => {
    expect(estadoDemora(conf('2026-06-08'), ahora, 'BLOQUEADO', 'CONFIRMADA').estado).toBe(
      'RETENIDA_CARTERA',
    );
  });

  it('respeta umbrales personalizados', () => {
    const cfg = { diasAmarillo: 3, diasRojo: 7 };
    expect(estadoDemora(conf('2026-07-04T12:00:00Z'), ahora, 'AL_DIA', 'CONFIRMADA', cfg).estado).toBe(
      'AMARILLO',
    );
  });
});
