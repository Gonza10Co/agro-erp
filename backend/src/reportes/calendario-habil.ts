/**
 * Calendario laboral y prorrateo de la meta mensual. Lógica pura.
 *
 * El cliente lleva metas MENSUALES pero quiere ver el cumplimiento DIARIO
 * (JP, 2026-07-29). Sin días hábiles ese número es falso de dos maneras: el día 3
 * del mes todo se ve en 10% aunque la planta vaya perfecta, y un mes con tres
 * festivos exige el mismo ritmo diario que uno sin ninguno.
 */

export interface CalendarioMin {
  /** Índice = día de la semana en UTC (0 = domingo … 6 = sábado). */
  diasSemana: boolean[];
  /** Fechas 'YYYY-MM-DD' que no se trabajan: festivos y paradas puntuales. */
  noHabiles: string[];
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Día de la semana (0-6) de una clave 'YYYY-MM-DD', sin sorpresas de zona horaria. */
function diaSemana(clave: string): number {
  return new Date(`${clave}T00:00:00Z`).getUTCDay();
}

export function esHabil(clave: string, cal: CalendarioMin): boolean {
  if (cal.noHabiles.includes(clave)) return false;
  return cal.diasSemana[diaSemana(clave)] === true;
}

/** Claves 'YYYY-MM-DD' de los días trabajables del mes, en orden. */
export function diasHabilesDelMes(anio: number, mes: number, cal: CalendarioMin): string[] {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const clave = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (esHabil(clave, cal)) dias.push(clave);
  }
  return dias;
}

/** Lo que hay que producir cada día para llegar a la meta del mes. */
export function metaDiaria(metaMensual: number, habilesDelMes: number): number {
  if (habilesDelMes <= 0) return 0;
  return r2(metaMensual / habilesDelMes);
}

/**
 * Lo que se debería llevar acumulado a esta altura del mes. Es el número contra el
 * que tiene sentido comparar el real: el mes entero solo sirve el día 30.
 */
export function metaEsperadaALaFecha(
  metaMensual: number,
  habilesTranscurridos: number,
  habilesDelMes: number,
): number {
  if (habilesDelMes <= 0) return 0;
  const transcurridos = Math.min(Math.max(habilesTranscurridos, 0), habilesDelMes);
  return r2((metaMensual * transcurridos) / habilesDelMes);
}
