import { siguientePasoLabel } from './fabricacion.models';

describe('siguientePasoLabel', () => {
  it('CORTE → Guarnición', () => expect(siguientePasoLabel('CORTE', null)).toBe('Guarnición'));
  it('Guarnición/ARMADO → Vistas', () => expect(siguientePasoLabel('GUARNICION', 'ARMADO')).toBe('Vistas'));
  it('Guarnición/AMARRE → Almacén (sale la capellada)', () => expect(siguientePasoLabel('GUARNICION', 'AMARRE')).toBe('Almacén'));
  it('Inyección → P. Terminado', () => expect(siguientePasoLabel('INYECCION', null)).toBe('P. Terminado'));
  it('PT → null', () => expect(siguientePasoLabel('PT', null)).toBeNull());
});
