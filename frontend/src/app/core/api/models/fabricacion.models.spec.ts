import { siguientePasoLabel, pasoActualLabel } from './fabricacion.models';

describe('siguientePasoLabel', () => {
  it('CORTE → Guarnición', () => expect(siguientePasoLabel('CORTE', null)).toBe('Guarnición'));
  it('Guarnición/ARMADO → Vistas', () => expect(siguientePasoLabel('GUARNICION', 'ARMADO')).toBe('Vistas'));
  it('Guarnición/AMARRE → Almacén (sale la capellada)', () => expect(siguientePasoLabel('GUARNICION', 'AMARRE')).toBe('Almacén'));
  it('Almacén → Inyección', () => expect(siguientePasoLabel('ALMACEN', null)).toBe('Inyección'));
  it('PT → null', () => expect(siguientePasoLabel('PT', null)).toBeNull());

  it('avanza sub-paso a sub-paso dentro de Inyección', () => {
    expect(siguientePasoLabel('INYECCION', null, 'MONTAJE')).toBe('Inyección');
    expect(siguientePasoLabel('INYECCION', null, 'INYECCION')).toBe('Finizaje');
    expect(siguientePasoLabel('INYECCION', null, 'FINIZAJE')).toBe('Impacto');
  });
  it('Inyección/IMPACTO → P. Terminado', () =>
    expect(siguientePasoLabel('INYECCION', null, 'IMPACTO')).toBe('P. Terminado'));
  it('un par viejo en Inyección sin sub-paso sigue yendo a P. Terminado', () =>
    expect(siguientePasoLabel('INYECCION', null)).toBe('P. Terminado'));
});

describe('pasoActualLabel', () => {
  it('sin sub-pasos muestra solo la célula', () => {
    expect(pasoActualLabel('CORTE', null)).toBe('Corte');
    expect(pasoActualLabel('INYECCION', null)).toBe('Inyección');
  });
  it('detalla el sub-paso cuando lo hay', () => {
    expect(pasoActualLabel('GUARNICION', 'STROBEL')).toBe('Guarnición · Strobel');
    expect(pasoActualLabel('INYECCION', null, 'FINIZAJE')).toBe('Inyección · Finizaje');
  });
});
