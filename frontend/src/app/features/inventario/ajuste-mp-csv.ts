import { FilaAjusteMp, FilaPlantillaMp } from '../../core/api/models/inventario.models';

/**
 * Plantilla CSV del conteo físico de materia prima. Lógica pura; gemela de
 * ajuste-pt-csv.ts, pero el conteo admite decimales (metros, kilos).
 *
 * Separador `;` y BOM UTF-8, como la de botas: así Excel en español (Colombia)
 * la abre en columnas. En ese Excel la COMA es el separador decimal, así que:
 *  - al generar, disponible y reservado se escriben con coma ("12,5") para que
 *    Excel los lea como número y no como texto;
 *  - al leer un archivo con `;`, la coma de la celda es decimal: "12,5" → 12.5,
 *    "1.234,5" → 1234.5 (el punto es de miles si vienen ambos) y "12.5" también vale.
 * Si el header no trae `;` se asume un CSV con comas (Google Sheets en inglés):
 * ahí la coma separa columnas y el decimal solo puede ser punto.
 */

export const COLUMNAS_PLANTILLA_MP = [
  'codigo_material',
  'material',
  'unidad',
  'categoria',
  'disponible_actual',
  'reservado',
  'conteo_fisico',
] as const;

const OBLIGATORIAS = ['codigo_material', 'conteo_fisico'];

function celda(valor: string | number): string {
  const s = String(valor);
  return /[;,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Número con coma decimal y sin miles, como lo lee Excel en es-CO. */
export function numeroConComa(n: number): string {
  return String(n).replace('.', ',');
}

export function generarCsvPlantillaMp(filas: FilaPlantillaMp[]): string {
  const lineas = [COLUMNAS_PLANTILLA_MP.join(';')];
  for (const f of filas)
    lineas.push(
      [
        celda(f.codigo),
        celda(f.material),
        celda(f.unidad),
        celda(f.categoria),
        // Sin comillas: entrecomillado, Excel lo tomaría como texto.
        numeroConComa(f.disponible),
        numeroConComa(f.reservado),
        '',
      ].join(';'),
    );
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

/**
 * Lee una cantidad de una celda. Devuelve null si no es un número legible.
 * No limita los decimales: el backend marca la fila si trae más de 4.
 */
export function leerCantidad(texto: string, sepColumnas: ';' | ','): number | null {
  let s = texto.replace(/\s/g, ''); // \s incluye el espacio duro que a veces deja Excel
  if (sepColumnas === ';') {
    const coma = s.lastIndexOf(',');
    const punto = s.lastIndexOf('.');
    if (coma >= 0 && punto >= 0) {
      // Vienen ambos: el último es el decimal y el otro separa miles.
      const posDecimal = Math.max(coma, punto);
      const miles = coma > punto ? '\\.' : ',';
      const entero = s.slice(0, posDecimal);
      if (!new RegExp(`^-?\\d{1,3}(${miles}\\d{3})*$`).test(entero)) return null;
      s = `${entero.replace(/[.,]/g, '')}.${s.slice(posDecimal + 1)}`;
    } else if (coma >= 0) {
      if (s.indexOf(',') !== coma) return null; // "1,234,5": ambiguo
      s = s.replace(',', '.');
    } else if (s.indexOf('.') !== punto) {
      // Solo puntos, varios: son de miles ("1.234.567").
      if (!/^-?\d{1,3}(\.\d{3})+$/.test(s)) return null;
      s = s.split('.').join('');
    }
  }
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  return Number(s);
}

function partirLinea(linea: string, sep: string): string[] {
  const campos: string[] = [];
  let actual = '';
  let enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else enComillas = !enComillas;
    } else if (c === sep && !enComillas) {
      campos.push(actual);
      actual = '';
    } else actual += c;
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

export interface ResultadoLecturaMp {
  filas: FilaAjusteMp[];
  /** Filas que traen conteo_fisico vacío: no se tocan. */
  omitidas: number;
  errores: string[];
}

/**
 * Lee el archivo que devuelve la persona. Solo viajan las filas con conteo;
 * los errores de forma se cuentan aquí y los de negocio los decide el backend.
 */
export function leerCsvAjusteMp(texto: string): ResultadoLecturaMp {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const header = lineas[0] ?? '';
  const sep: ';' | ',' = header.includes(';') ? ';' : ',';
  const cols = partirLinea(header, sep).map((c) => c.toLowerCase());
  const faltan = OBLIGATORIAS.filter((c) => !cols.includes(c));
  if (faltan.length)
    return {
      filas: [],
      omitidas: 0,
      errores: [`Al archivo le faltan las columnas: ${faltan.join(', ')}. Use la plantilla descargada.`],
    };
  const idx = (c: string) => cols.indexOf(c);

  const filas: FilaAjusteMp[] = [];
  const errores: string[] = [];
  let omitidas = 0;
  lineas.slice(1).forEach((linea, i) => {
    const fila = i + 2; // como la numera Excel: el header es la 1
    if (!linea.trim()) return;
    const v = partirLinea(linea, sep);
    const conteoTxt = v[idx('conteo_fisico')] ?? '';
    if (conteoTxt === '') {
      omitidas++;
      return;
    }
    const conteo = leerCantidad(conteoTxt, sep);
    if (conteo === null) {
      errores.push(`Fila ${fila}: el conteo "${conteoTxt}" no es un número`);
      return;
    }
    filas.push({ fila, codigo: v[idx('codigo_material')] ?? '', conteo });
  });
  return { filas, omitidas, errores };
}
