import { generarCsvPlantilla, leerCsvAjuste } from './ajuste-pt-csv';
import { FilaPlantillaPt } from '../../core/api/models/inventario.models';

const fila = (over: Partial<FilaPlantillaPt> = {}): FilaPlantillaPt => ({
  referencia: '101',
  marca: 'Poderosa',
  producto: 'Bota Poderosa · Café',
  codigo: '101-PODEROSA-CAFE',
  talla: 38,
  bodega: 'IBG',
  calidad: 'PRIMERA',
  disponible: 20,
  reservado: 8,
  ...over,
});

describe('plantilla CSV de ajuste de producto terminado', () => {
  it('genera separador ; con BOM y conteo vacío', () => {
    const csv = generarCsvPlantilla([fila()]);
    expect(csv.startsWith('﻿')).toBeTrue();
    const [header, linea] = csv.slice(1).split('\r\n');
    expect(header).toBe(
      'referencia;marca;producto;codigo_producto;talla;calidad;bodega;disponible_actual;reservado;conteo_fisico',
    );
    expect(linea).toBe('101;Poderosa;Bota Poderosa · Café;101-PODEROSA-CAFE;38;PRIMERA;IBG;20;8;');
  });

  it('entrecomilla los textos con separador o comillas', () => {
    const csv = generarCsvPlantilla([fila({ producto: 'Bota "Pro"; negra' })]);
    expect(csv).toContain('"Bota ""Pro""; negra"');
  });

  it('ida y vuelta: lo que genera se lee igual, y la fila sin conteo se omite', () => {
    const csv = generarCsvPlantilla([fila(), fila({ talla: 39 })])
      .replace(';20;8;\r\n', ';20;8;25\r\n');
    const r = leerCsvAjuste(csv);
    expect(r.errores).toEqual([]);
    expect(r.omitidas).toBe(1);
    expect(r.filas).toEqual([
      { fila: 2, codigo: '101-PODEROSA-CAFE', talla: 38, bodega: 'IBG', calidad: 'PRIMERA', conteo: 25 },
    ]);
  });

  it('acepta el archivo guardado con comas (Google Sheets)', () => {
    const r = leerCsvAjuste('codigo_producto,talla,calidad,bodega,conteo_fisico\n101-X,40,SEGUNDA,IBG,3\n');
    expect(r.filas).toEqual([
      { fila: 2, codigo: '101-X', talla: 40, bodega: 'IBG', calidad: 'SEGUNDA', conteo: 3 },
    ]);
  });

  it('rechaza el archivo sin las columnas de la plantilla', () => {
    const r = leerCsvAjuste('codigo;cantidad\nA;1');
    expect(r.errores[0]).toMatch(/faltan las columnas: codigo_producto, talla, calidad, bodega, conteo_fisico/);
  });

  it('reporta con su número de fila un conteo o una talla ilegibles', () => {
    const r = leerCsvAjuste('codigo_producto;talla;calidad;bodega;conteo_fisico\nA;38;PRIMERA;IBG;diez\nA;x;PRIMERA;IBG;4');
    expect(r.errores).toEqual([
      'Fila 2: el conteo "diez" no es un número',
      'Fila 3: la talla "x" no es un número entero',
    ]);
  });
});
