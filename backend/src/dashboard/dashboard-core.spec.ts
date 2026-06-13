import { rangoMes } from './dashboard-core';

describe('dashboard-core', () => {
  describe('rangoMes', () => {
    it('devuelve el 1° del mes y el 1° del mes siguiente', () => {
      const { desde, hasta } = rangoMes(new Date('2026-06-10T15:30:00Z'));
      expect(desde.toISOString().slice(0, 10)).toBe('2026-06-01');
      expect(hasta.toISOString().slice(0, 10)).toBe('2026-07-01');
    });

    it('cruza fin de año (diciembre → enero siguiente)', () => {
      const { desde, hasta } = rangoMes(new Date('2026-12-20T00:00:00Z'));
      expect(desde.toISOString().slice(0, 10)).toBe('2026-12-01');
      expect(hasta.toISOString().slice(0, 10)).toBe('2027-01-01');
    });
  });
});
