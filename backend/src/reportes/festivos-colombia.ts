/**
 * Festivos de Colombia para un año dado. Lógica pura.
 *
 * Se calculan en vez de cargarse a mano porque son 18 al año y la mitad se mueve:
 * dependen de la Pascua y de la **Ley Emiliani** (Ley 51 de 1983), que traslada
 * varios festivos al lunes siguiente para hacer puente.
 */

export interface Festivo {
  fecha: string; // 'YYYY-MM-DD'
  motivo: string;
}

const clave = (d: Date): string => d.toISOString().slice(0, 10);

/** Domingo de Pascua (algoritmo de Butcher, calendario gregoriano). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, dia));
}

const sumarDias = (d: Date, n: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

/** Ley Emiliani: si no cae lunes, se corre al lunes siguiente. */
function alLunesSiguiente(d: Date): Date {
  const dow = d.getUTCDay(); // 0 = domingo, 1 = lunes
  return dow === 1 ? d : sumarDias(d, (8 - dow) % 7);
}

export function festivosColombia(anio: number): Festivo[] {
  const pascua = domingoDePascua(anio);
  const fijo = (mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia));

  const festivos: [Date, string][] = [
    [fijo(1, 1), 'Año Nuevo'],
    [alLunesSiguiente(fijo(1, 6)), 'Reyes Magos'],
    [alLunesSiguiente(fijo(3, 19)), 'San José'],
    [sumarDias(pascua, -3), 'Jueves Santo'],
    [sumarDias(pascua, -2), 'Viernes Santo'],
    [fijo(5, 1), 'Día del Trabajo'],
    [alLunesSiguiente(sumarDias(pascua, 39)), 'Ascensión del Señor'],
    [alLunesSiguiente(sumarDias(pascua, 60)), 'Corpus Christi'],
    [alLunesSiguiente(sumarDias(pascua, 68)), 'Sagrado Corazón'],
    [alLunesSiguiente(fijo(6, 29)), 'San Pedro y San Pablo'],
    [fijo(7, 20), 'Día de la Independencia'],
    [fijo(8, 7), 'Batalla de Boyacá'],
    [alLunesSiguiente(fijo(8, 15)), 'Asunción de la Virgen'],
    [alLunesSiguiente(fijo(10, 12)), 'Día de la Raza'],
    [alLunesSiguiente(fijo(11, 1)), 'Todos los Santos'],
    [alLunesSiguiente(fijo(11, 11)), 'Independencia de Cartagena'],
    [fijo(12, 8), 'Inmaculada Concepción'],
    [fijo(12, 25), 'Navidad'],
  ];

  return festivos
    .map(([fecha, motivo]) => ({ fecha: clave(fecha), motivo }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
