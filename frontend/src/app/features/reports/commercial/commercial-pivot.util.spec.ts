import { CommercialReport } from '../../../core/api/models/commercial-report.models';
import { defaultRange, exportFileName, monthLabel, pivotSheets, pivotTable } from './commercial-pivot.util';

const m = (pairs: number, orders = 1, value = 0, dispatched = 0) => ({ pairs, orders, value, dispatched });

const REPORT: CommercialReport = {
  from: '2026-10-01', to: '2026-11-30', rows: 'brand', months: ['2026-10', '2026-11'],
  kpis: { ...m(450, 2, 3_500_000, 340), pending: 110, unpricedPairs: 50, clients: 2 },
  byMonth: [{ month: '2026-10', ...m(150) }, { month: '2026-11', ...m(300) }],
  topClients: [], topReferences: [],
  pivot: {
    rows: [
      { key: '11', label: 'ABRUZZO', cells: { '2026-10': m(50), '2026-11': m(0, 0) }, total: m(50) },
      { key: '10', label: 'AGRO', cells: { '2026-10': m(100, 1, 1_000_000), '2026-11': m(300, 1, 2_500_000) }, total: m(400, 2, 3_500_000) },
    ],
    totals: { cells: { '2026-10': m(150), '2026-11': m(300) }, total: m(450, 2, 3_500_000) },
  },
  options: { clients: [], brands: [], references: [], lines: [] },
};

describe('commercial-pivot.util', () => {
  it('pivotTable proyecta una medida, ordena por total y calcula participación', () => {
    const t = pivotTable(REPORT, 'pairs');
    expect(t.rows.map((r) => [r.label, r.values, r.total, r.share])).toEqual([
      ['AGRO', [100, 300], 400, 88.9],
      ['ABRUZZO', [50, 0], 50, 11.1],
    ]);
    expect(t.totals).toEqual([150, 300]);
    expect(t.grandTotal).toBe(450);
  });

  it('pivotTable con otra medida y búsqueda', () => {
    const t = pivotTable(REPORT, 'value', 'agr');
    expect(t.rows.map((r) => r.label)).toEqual(['AGRO']);
    expect(t.rows[0].values).toEqual([1_000_000, 2_500_000]);
    // Los pedidos no se suman fila a fila: el total sale del reporte.
    expect(pivotTable(REPORT, 'orders').grandTotal).toBe(2);
  });

  it('pivotSheets: una hoja por medida, la elegida primero, con fila de total', () => {
    const hojas = pivotSheets(REPORT, 'value');
    expect(hojas.map((h) => h.nombre)).toEqual(['Valor', 'Pares pedidos', 'Pares despachados', 'Número de pedidos']);
    const pares = hojas[1].filas;
    expect((pares[0][0] as any).v).toBe('Marca');
    expect((pares[0][1] as any).v).toBe('oct 2026');
    expect(pares[1].slice(0, 3)).toEqual(['AGRO', 100, 300]);
    expect((pares[pares.length - 1][3] as any).v).toBe(450);
  });

  it('etiquetas, nombre de archivo y rango por defecto', () => {
    expect(monthLabel('2026-01')).toBe('ene 2026');
    expect(exportFileName('reference', new Date('2026-11-21T15:00:00Z'))).toBe('reporte comercial por referencia 2026-11-21.xlsx');
    expect(defaultRange(new Date('2026-11-21T03:00:00Z'))).toEqual({ from: '2025-12-01', to: '2026-11-20' });
  });
});
