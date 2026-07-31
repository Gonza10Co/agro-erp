import {
  diasHabilesDelMes,
  esHabil,
  metaDiaria,
  metaEsperadaALaFecha,
  CalendarioMin,
} from './calendario-habil';

/** Junio 2026: arranca lunes 1 y termina martes 30. */
const LUN_A_VIE: CalendarioMin = { diasSemana: [false, true, true, true, true, true, false], noHabiles: [] };
const LUN_A_SAB: CalendarioMin = { diasSemana: [false, true, true, true, true, true, true], noHabiles: [] };

describe('esHabil', () => {
  it('el domingo no se trabaja con la config de lunes a viernes', () => {
    expect(esHabil('2026-06-07', LUN_A_VIE)).toBe(false); // domingo
    expect(esHabil('2026-06-08', LUN_A_VIE)).toBe(true); // lunes
  });

  it('el sábado depende de la configuración, que es justo lo que falta confirmar', () => {
    expect(esHabil('2026-06-06', LUN_A_VIE)).toBe(false);
    expect(esHabil('2026-06-06', LUN_A_SAB)).toBe(true);
  });

  it('un festivo no es hábil aunque caiga entre semana', () => {
    const conFestivo: CalendarioMin = { ...LUN_A_VIE, noHabiles: ['2026-06-15'] }; // Corpus Christi
    expect(esHabil('2026-06-15', conFestivo)).toBe(false);
    expect(esHabil('2026-06-16', conFestivo)).toBe(true);
  });
});

describe('diasHabilesDelMes', () => {
  it('junio 2026 de lunes a viernes tiene 22 días hábiles', () => {
    expect(diasHabilesDelMes(2026, 6, LUN_A_VIE)).toHaveLength(22);
  });

  it('sumar los sábados cambia el divisor de la meta (26 días)', () => {
    expect(diasHabilesDelMes(2026, 6, LUN_A_SAB)).toHaveLength(26);
  });

  it('los festivos del mes se descuentan', () => {
    const conFestivos: CalendarioMin = { ...LUN_A_VIE, noHabiles: ['2026-06-15', '2026-06-22', '2026-06-29'] };
    expect(diasHabilesDelMes(2026, 6, conFestivos)).toHaveLength(19);
  });

  it('un festivo que cae domingo no descuenta dos veces', () => {
    const conFestivo: CalendarioMin = { ...LUN_A_VIE, noHabiles: ['2026-06-07'] };
    expect(diasHabilesDelMes(2026, 6, conFestivo)).toHaveLength(22);
  });

  it('devuelve las fechas en orden y en formato YYYY-MM-DD', () => {
    const dias = diasHabilesDelMes(2026, 6, LUN_A_VIE);
    expect(dias[0]).toBe('2026-06-01');
    expect(dias.at(-1)).toBe('2026-06-30');
  });
});

describe('metaDiaria', () => {
  it('reparte la meta mensual entre los días hábiles', () => {
    expect(metaDiaria(22000, 22)).toBe(1000);
  });
  it('redondea a 2 decimales', () => {
    expect(metaDiaria(20000, 22)).toBe(909.09);
  });
  it('sin días hábiles no inventa una meta (evita dividir por cero)', () => {
    expect(metaDiaria(20000, 0)).toBe(0);
  });
});

describe('metaEsperadaALaFecha', () => {
  it('a mitad de mes se espera la mitad de la meta, no el mes entero', () => {
    // 11 de 22 hábiles transcurridos.
    expect(metaEsperadaALaFecha(22000, 11, 22)).toBe(11000);
  });

  it('el día 1 la expectativa es la de un solo día, no cero', () => {
    expect(metaEsperadaALaFecha(22000, 1, 22)).toBe(1000);
  });

  it('con el mes cerrado la expectativa es la meta completa', () => {
    expect(metaEsperadaALaFecha(22000, 22, 22)).toBe(22000);
  });

  it('nunca pasa de la meta mensual aunque se pidan más días', () => {
    expect(metaEsperadaALaFecha(22000, 30, 22)).toBe(22000);
  });

  it('sin días hábiles devuelve 0', () => {
    expect(metaEsperadaALaFecha(22000, 5, 0)).toBe(0);
  });
});
