import { generarCsvPlantillaMp, leerCantidad, leerCsvAjusteMp } from './ajuste-mp-csv';
import { FilaPlantillaMp } from '../../core/api/models/inventario.models';

const fila = (over: Partial<FilaPlantillaMp> = {}): FilaPlantillaMp => ({
  codigo: 'CUERO-01',
  material: 'Cuero graso negro',
  unidad: 'DM2',
  categoria: 'Cueros',
  disponible: 20.5,
  reservado: 8,
  ...over,
});

describe('plantilla CSV de ajuste de materia prima', () => {
  it('genera separador ; con BOM, cantidades con coma decimal y conteo vacío', () => {
    const csv = generarCsvPlantillaMp([fila()]);
    expect(csv.startsWith('﻿')).toBeTrue();
    const [header, linea] = csv.slice(1).split('\r\n');
    expect(header).toBe('codigo_material;material;unidad;categoria;disponible_actual;reservado;conteo_fisico');
    expect(linea).toBe('CUERO-01;Cuero graso negro;DM2;Cueros;20,5;8;');
  });

  it('entrecomilla los textos con separador o comillas, no los números', () => {
    const csv = generarCsvPlantillaMp([fila({ material: 'Hilo "Pro"; 40,2', disponible: 0.0001 })]);
    expect(csv).toContain(';"Hilo ""Pro""; 40,2";DM2;Cueros;0,0001;8;');
  });

  it('ida y vuelta: el conteo con coma decimal se lee y la fila vacía se omite', () => {
    const csv = generarCsvPlantillaMp([fila(), fila({ codigo: 'HILO-02' })]).replace(';20,5;8;\r\n', ';20,5;8;12,75\r\n');
    const r = leerCsvAjusteMp(csv);
    expect(r.errores).toEqual([]);
    expect(r.omitidas).toBe(1);
    expect(r.filas).toEqual([{ fila: 2, codigo: 'CUERO-01', conteo: 12.75 }]);
  });

  it('con separador ; entiende coma decimal, miles con punto y punto decimal', () => {
    expect(leerCantidad('12,5', ';')).toBe(12.5);
    expect(leerCantidad('1.234,5', ';')).toBe(1234.5);
    expect(leerCantidad('1,234.5', ';')).toBe(1234.5);
    expect(leerCantidad('12.5', ';')).toBe(12.5);
    expect(leerCantidad('1.234.567', ';')).toBe(1234567);
    expect(leerCantidad(' 7 ', ';')).toBe(7);
    expect(leerCantidad('-3', ';')).toBe(-3);
    expect(leerCantidad('1,2,3', ';')).toBeNull();
    expect(leerCantidad('12.34.5', ';')).toBeNull();
    expect(leerCantidad('diez', ';')).toBeNull();
  });

  it('acepta el archivo guardado con comas (Google Sheets): ahí el decimal es punto', () => {
    const r = leerCsvAjusteMp('codigo_material,conteo_fisico\nHILO-02,3.25\n"CUERO-01","4,5"\n');
    expect(r.filas).toEqual([{ fila: 2, codigo: 'HILO-02', conteo: 3.25 }]);
    expect(r.errores).toEqual(['Fila 3: el conteo "4,5" no es un número']);
  });

  it('deja pasar más de 4 decimales: el backend marca la fila', () => {
    const r = leerCsvAjusteMp('codigo_material;conteo_fisico\nA;1,23456');
    expect(r.filas).toEqual([{ fila: 2, codigo: 'A', conteo: 1.23456 }]);
  });

  it('rechaza el archivo sin las columnas de la plantilla', () => {
    const r = leerCsvAjusteMp('codigo;cantidad\nA;1');
    expect(r.errores[0]).toMatch(/faltan las columnas: codigo_material, conteo_fisico/);
  });
});
