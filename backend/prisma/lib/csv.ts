import { readFileSync, existsSync } from 'node:fs';

// Parser CSV mínimo con soporte de comillas dobles y comas dentro de comillas.
// Suficiente para los maestros exportados del Drive (un registro por línea).
export function parseCsv(texto: string): Record<string, string>[] {
  const limpio = texto.replace(/^﻿/, ''); // quita BOM
  const lineas = limpio.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return [];
  const headers = partirLinea(lineas[0]).map((h) => h.trim());
  return lineas.slice(1).map((linea) => {
    const celdas = partirLinea(linea);
    const fila: Record<string, string> = {};
    headers.forEach((h, i) => { fila[h] = (celdas[i] ?? '').trim(); });
    return fila;
  });
}

function partirLinea(linea: string): string[] {
  const out: string[] = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else entreComillas = !entreComillas;
    } else if (c === ',' && !entreComillas) {
      out.push(actual); actual = '';
    } else {
      actual += c;
    }
  }
  out.push(actual);
  return out;
}

// Lee un CSV del directorio de datos; si no existe, devuelve [] y avisa
// (permite correr el seed con solo algunos archivos presentes).
export function leerCsv(ruta: string): Record<string, string>[] {
  if (!existsSync(ruta)) {
    console.warn(`  · (omitido) no existe ${ruta}`);
    return [];
  }
  return parseCsv(readFileSync(ruta, 'utf8'));
}

// Convierte un string a número o null (campos opcionales vacíos → null).
export function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
