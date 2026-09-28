import { FilaAjustePt, FilaPlantillaPt } from '../../core/api/models/inventario.models';

/**
 * Plantilla CSV del conteo físico de producto terminado. Lógica pura.
 *
 * Separador `;` y BOM UTF-8: es lo que Excel en español (Colombia) abre en
 * columnas y con tildes sin pasar por el asistente de importación. Al leer se
 * acepta también `,`, por si alguien la guarda desde Google Sheets.
 */

export const COLUMNAS_PLANTILLA = [
  'referencia',
  'marca',
  'producto',
  'codigo_producto',
  'talla',
  'calidad',
  'bodega',
  'disponible_actual',
  'reservado',
  'conteo_fisico',
] as const;

const OBLIGATORIAS = ['codigo_producto', 'talla', 'calidad', 'bodega', 'conteo_fisico'];

function celda(valor: string | number): string {
  const s = String(valor);
  return /[;,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function generarCsvPlantilla(filas: FilaPlantillaPt[]): string {
  const lineas = [COLUMNAS_PLANTILLA.join(';')];
  for (const f of filas)
    lineas.push(
      [f.referencia, f.marca, f.producto, f.codigo, f.talla, f.calidad, f.bodega, f.disponible, f.reservado, '']
        .map(celda)
        .join(';'),
    );
  return '﻿' + lineas.join('\r\n') + '\r\n';
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

export interface ResultadoLectura {
  filas: FilaAjustePt[];
  /** Filas que traen conteo_fisico vacío: no se tocan. */
  omitidas: number;
  errores: string[];
}

/**
 * Lee el archivo que devuelve la persona. Solo viajan las filas con conteo:
 * las vacías se omiten (no cambian nada). Los errores de forma (columnas que
 * faltan, número ilegible) se cuentan aquí; los de negocio los decide el backend.
 */
export function leerCsvAjuste(texto: string): ResultadoLectura {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const header = lineas[0] ?? '';
  const sep = (header.match(/;/g)?.length ?? 0) >= (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const cols = partirLinea(header, sep).map((c) => c.toLowerCase());
  const faltan = OBLIGATORIAS.filter((c) => !cols.includes(c));
  if (faltan.length)
    return {
      filas: [],
      omitidas: 0,
      errores: [`Al archivo le faltan las columnas: ${faltan.join(', ')}. Use la plantilla descargada.`],
    };
  const idx = (c: string) => cols.indexOf(c);

  const filas: FilaAjustePt[] = [];
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
    const conteo = Number(conteoTxt);
    const talla = Number(v[idx('talla')]);
    if (!Number.isFinite(conteo)) {
      errores.push(`Fila ${fila}: el conteo "${conteoTxt}" no es un número`);
      return;
    }
    if (!Number.isInteger(talla)) {
      errores.push(`Fila ${fila}: la talla "${v[idx('talla')]}" no es un número entero`);
      return;
    }
    filas.push({
      fila,
      codigo: v[idx('codigo_producto')] ?? '',
      talla,
      bodega: v[idx('bodega')] ?? '',
      calidad: v[idx('calidad')] ?? '',
      conteo,
    });
  });
  return { filas, omitidas, errores };
}
