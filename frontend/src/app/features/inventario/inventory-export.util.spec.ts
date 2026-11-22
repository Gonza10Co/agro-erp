import { InventarioConsolidado, PtStock, WipDetailRow } from '../../core/api/models/inventario.models';
import { crearXlsx } from '../../shared/xlsx/xlsx-mini';
import {
  COLUMNAS_MP,
  COLUMNAS_PT,
  COLUMNAS_WIP,
  FILTROS_VACIOS,
  filterPt,
  hojaMatrizPt,
  inventoryFileName,
  inventorySheets,
} from './inventory-export.util';

const pt = (o: Partial<PtStock>): PtStock => ({
  producto: 'PODEROSA · Con puntera', codigo: 'PC-1', referencia: '101', marca: 'PODEROSA',
  lineaId: 4, linea: 'Basarili', talla: 40, bodega: 'Ibagué', calidad: 'PRIMERA',
  cantDisponible: 10, cantReservada: 0, ...o,
});

const datos: InventarioConsolidado = {
  materiales: [
    { materialId: 1, codigo: 'PMAR145', nombre: 'Marquilla Agro', unidad: 'UND', categoria: 'Marquillas', cantDisponible: 214, cantReservada: 87 },
    { materialId: 2, codigo: 'POLIOL', nombre: 'Poliol', unidad: 'KG', categoria: 'Químicos', cantDisponible: 8.56, cantReservada: 6.1 },
  ],
  wip: [
    { celula: 'CORTE', pares: 0 },
    { celula: 'GUARNICION', pares: 20 },
    { celula: 'ALMACEN', pares: 0 },
    { celula: 'INYECCION', pares: 5 },
    { celula: 'PT', pares: 0 },
  ],
  pt: [
    pt({ talla: 40, cantDisponible: 10, cantReservada: 4 }),
    pt({ talla: 38, cantDisponible: 6, bodega: 'Bogotá' }),
    pt({ talla: 40, cantDisponible: 3, bodega: 'Bogotá' }),
    pt({ talla: 40, calidad: 'SEGUNDA', cantDisponible: 2 }),
    pt({ codigo: 'PC-9', referencia: '102', marca: 'FEROZ', lineaId: 12, linea: 'Feroz', producto: 'FEROZ 102', talla: 42, cantDisponible: 7 }),
  ],
};

const wip: WipDetailRow[] = [
  { celula: 'GUARNICION', of: 21, linea: 'Basarili', referencia: '101', marca: 'PODEROSA', producto: 'PODEROSA · Con puntera', codigo: 'PC-1', talla: 40, calidad: 'PRIMERA', pares: 20 },
  { celula: 'INYECCION', of: 22, linea: 'Feroz', referencia: '102', marca: 'FEROZ', producto: 'FEROZ 102', codigo: 'PC-9', talla: 42, calidad: 'PRIMERA', pares: 5 },
];

const valores = (fila: any[]) => fila.map((c) => (c !== null && typeof c === 'object' ? c.v : c));
const AHORA = new Date('2026-11-21T20:30:00Z'); // 15:30 en Colombia
const hoja = (hs: ReturnType<typeof inventorySheets>, n: string) => hs.find((h) => h.nombre === n)!;

describe('inventory-export.util', () => {
  it('arma resumen, matriz PT, PT detalle, materia prima y en proceso', () => {
    const hs = inventorySheets({ data: datos, wip, filtros: FILTROS_VACIOS, ahora: AHORA });
    expect(hs.map((h) => h.nombre)).toEqual(['Resumen', 'PT por talla', 'PT detalle', 'Materia prima', 'En proceso']);
    expect(valores(hoja(hs, 'PT detalle').filas[0])).toEqual(COLUMNAS_PT);
    expect(valores(hoja(hs, 'Materia prima').filas[0])).toEqual(COLUMNAS_MP);
    expect(valores(hoja(hs, 'En proceso').filas[0])).toEqual(COLUMNAS_WIP);
    hoja(hs, 'PT detalle').filas.forEach((f) => expect(f.length).toBe(COLUMNAS_PT.length));
    hoja(hs, 'En proceso').filas.forEach((f) => expect(f.length).toBe(COLUMNAS_WIP.length));
    // Genera un .xlsx válido (zip que empieza por PK).
    const bytes = crearXlsx(hs);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('PT detalle trae existencia, amarrado y libre como números, con la fecha de corte real', () => {
    const fila = hoja(inventorySheets({ data: datos, wip, filtros: FILTROS_VACIOS, ahora: AHORA }), 'PT detalle').filas[1];
    expect(valores(fila)).toEqual([
      46347, 'Ibagué', 'Basarili', '101', 'PODEROSA', 'PODEROSA · Con puntera', 'PC-1', 'Primera', 40, 10, 4, 6,
    ]);
  });

  it('materia prima calcula lo libre sin ruido de decimales', () => {
    const filas = hoja(inventorySheets({ data: datos, wip, filtros: FILTROS_VACIOS, ahora: AHORA }), 'Materia prima').filas;
    expect(valores(filas[1]).slice(1)).toEqual(['PMAR145', 'Marquilla Agro', 'Marquillas', 'UND', 214, 87, 127]);
    expect(valores(filas[2])[7]).toBe(2.46);
  });

  it('la matriz suma bodegas, separa segundas y cierra con totales por talla', () => {
    const m = hojaMatrizPt(datos.pt);
    expect(valores(m.filas[0])).toEqual(['Referencia', 'Marca', 'Línea', 'Producto', 'Código', 'Calidad', '38', '40', '42', 'Total']);
    expect(valores(m.filas[1])).toEqual(['101', 'PODEROSA', 'Basarili', 'PODEROSA · Con puntera', 'PC-1', 'Primera', 6, 13, null, 19]);
    expect(valores(m.filas[2])).toEqual(['101', 'PODEROSA', 'Basarili', 'PODEROSA · Con puntera', 'PC-1', 'Segunda', null, 2, null, 2]);
    expect(valores(m.filas[3]).slice(0, 2)).toEqual(['102', 'FEROZ']);
    expect(valores(m.filas[4])).toEqual(['Total', null, null, null, null, null, 6, 15, 7, 28]);
    expect(m.congelar).toEqual({ filas: 1, columnas: 6 });
  });

  it('respeta los filtros de pantalla: línea, bodega, calidad y búsqueda sin tildes', () => {
    expect(filterPt(datos.pt, { ...FILTROS_VACIOS, lineaId: 12 }).map((p) => p.codigo)).toEqual(['PC-9']);
    expect(filterPt(datos.pt, { ...FILTROS_VACIOS, bodega: 'Bogotá' }).length).toBe(2);
    expect(filterPt(datos.pt, { ...FILTROS_VACIOS, calidad: 'SEGUNDA' }).length).toBe(1);
    expect(filterPt(datos.pt, { ...FILTROS_VACIOS, texto: 'feroz' }).length).toBe(1);

    const filtros = { ...FILTROS_VACIOS, texto: 'quimicos' };
    const hs = inventorySheets({ data: datos, wip, filtros, ahora: AHORA });
    expect(hoja(hs, 'Materia prima').filas.length).toBe(2);
    expect(hoja(hs, 'PT detalle').filas.length).toBe(1); // solo encabezado
    expect(hoja(hs, 'PT por talla').filas.length).toBe(1); // sin fila de total si no hay datos
    expect(hoja(hs, 'En proceso').filas.length).toBe(1);
  });

  it('el resumen dice la fecha y hora de corte, los filtros y los totales', () => {
    const filtros = { ...FILTROS_VACIOS, lineaId: 4, lineaNombre: 'Basarili', texto: 'PC-1' };
    const r = hoja(inventorySheets({ data: datos, wip, filtros, ahora: AHORA }), 'Resumen').filas.map(valores);
    expect(r).toContain(['Fecha de corte', '2026-11-21 15:30']);
    expect(r).toContain(['Línea', 'Basarili']);
    expect(r).toContain(['Búsqueda', 'PC-1']);
    expect(r).toContain(['Existencia', 21]);
    expect(r).toContain(['Amarrado a pedidos', 4]);
    expect(r).toContain(['Libre', 17]);
    // Con búsqueda, el WIP por célula sale del detalle filtrado.
    expect(r).toContain(['Guarnición', 20]);
    expect(r).toContain(['Inyección', 0]);
  });

  it('nombra el archivo con el día de Colombia', () => {
    expect(inventoryFileName(new Date('2026-11-22T03:00:00Z'))).toBe('inventarios 2026-11-21.xlsx');
  });
});
