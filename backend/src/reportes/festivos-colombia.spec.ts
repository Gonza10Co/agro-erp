import { festivosColombia, domingoDePascua } from './festivos-colombia';

describe('domingoDePascua', () => {
  it('acierta las Pascuas conocidas', () => {
    expect(domingoDePascua(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(domingoDePascua(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(domingoDePascua(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
  });
});

describe('festivosColombia', () => {
  const f2026 = festivosColombia(2026);
  const fecha = (motivo: string) => f2026.find((f) => f.motivo === motivo)?.fecha;

  it('son 18 festivos al año', () => {
    expect(f2026).toHaveLength(18);
    expect(festivosColombia(2027)).toHaveLength(18);
  });

  it('los fijos no se mueven', () => {
    expect(fecha('Año Nuevo')).toBe('2026-01-01');
    expect(fecha('Día del Trabajo')).toBe('2026-05-01');
    expect(fecha('Día de la Independencia')).toBe('2026-07-20');
    expect(fecha('Batalla de Boyacá')).toBe('2026-08-07');
    expect(fecha('Navidad')).toBe('2026-12-25');
  });

  it('la Semana Santa sale de la Pascua', () => {
    expect(fecha('Jueves Santo')).toBe('2026-04-02');
    expect(fecha('Viernes Santo')).toBe('2026-04-03');
  });

  it('Ley Emiliani: los trasladables caen siempre lunes', () => {
    const trasladables = [
      'Reyes Magos', 'San José', 'Ascensión del Señor', 'Corpus Christi',
      'Sagrado Corazón', 'San Pedro y San Pablo', 'Asunción de la Virgen',
      'Día de la Raza', 'Todos los Santos', 'Independencia de Cartagena',
    ];
    for (const motivo of trasladables) {
      const d = new Date(`${fecha(motivo)}T00:00:00Z`);
      expect(`${motivo} cae en día ${d.getUTCDay()}`).toBe(`${motivo} cae en día 1`);
    }
  });

  it('Reyes 2026 se corre del martes 6 al lunes 12', () => {
    expect(fecha('Reyes Magos')).toBe('2026-01-12');
  });

  it('un festivo que YA cae lunes no se mueve una semana', () => {
    // El 29 de junio de 2026 es lunes: San Pedro se queda ahí.
    expect(fecha('San Pedro y San Pablo')).toBe('2026-06-29');
  });

  it('vienen ordenados por fecha', () => {
    const fechas = f2026.map((f) => f.fecha);
    expect([...fechas].sort()).toEqual(fechas);
  });
});
