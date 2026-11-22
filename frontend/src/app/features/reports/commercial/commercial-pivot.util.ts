import { CommercialDimension, CommercialMeasure, CommercialReport, Measures } from '../../../core/api/models/commercial-report.models';
import { Celda, Hoja } from '../../../shared/xlsx/xlsx-mini';

/** Etiquetas de pantalla (español) de lo técnico (inglés). */
export const DIMENSION_LABEL: Record<CommercialDimension, string> = {
  client: 'Cliente',
  brand: 'Marca',
  reference: 'Referencia',
  line: 'Línea',
};

export const MEASURE_LABEL: Record<CommercialMeasure, string> = {
  pairs: 'Pares pedidos',
  dispatched: 'Pares despachados',
  value: 'Valor',
  orders: 'Número de pedidos',
};

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11' → 'nov 2026' */
export function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return `${MONTHS[m - 1] ?? ym} ${ym.slice(0, 4)}`;
}

export interface PivotTableRow {
  key: string;
  label: string;
  values: number[];
  total: number;
  /** Participación de la fila en el total (0..100). */
  share: number;
}

export interface PivotTable {
  dimension: CommercialDimension;
  measure: CommercialMeasure;
  months: string[];
  rows: PivotTableRow[];
  totals: number[];
  grandTotal: number;
}

/**
 * Proyecta el pivot del backend sobre UNA medida: filas = la dimensión elegida,
 * columnas = meses, más el total. Ordena por el total de esa medida (mayor primero).
 * Con `search` filtra las filas por nombre; los totales siguen siendo los del reporte
 * (un pedido con dos marcas no se puede sumar fila por fila sin contarlo doble).
 */
export function pivotTable(r: CommercialReport, measure: CommercialMeasure, search = ''): PivotTable {
  const pick = (m: Measures | undefined) => (m ? m[measure] : 0);
  const grandTotal = pick(r.pivot.totals.total);
  const q = search.trim().toLocaleLowerCase('es');
  const rows = r.pivot.rows
    .filter((row) => !q || row.label.toLocaleLowerCase('es').includes(q))
    .map((row) => {
      const total = pick(row.total);
      return {
        key: row.key,
        label: row.label,
        values: r.months.map((m) => pick(row.cells[m])),
        total,
        share: grandTotal ? Math.round((total / grandTotal) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'es'));
  return {
    dimension: r.rows,
    measure,
    months: r.months,
    rows,
    totals: r.months.map((m) => pick(r.pivot.totals.cells[m])),
    grandTotal,
  };
}

const header = (t: string): Celda => ({ v: t, estilo: 'encabezado' });
const bold = (v: string | number): Celda => ({ v, estilo: 'negrita' });

/**
 * La tabla dinámica en Excel: una hoja por medida (la elegida primero), filas por la
 * dimensión, una columna por mes y el total. Plana para que la puedan volver a pivotear.
 */
export function pivotSheets(r: CommercialReport, first: CommercialMeasure): Hoja[] {
  const order: CommercialMeasure[] = [first, ...(['pairs', 'dispatched', 'value', 'orders'] as CommercialMeasure[]).filter((m) => m !== first)];
  return order.map((measure) => {
    const t = pivotTable(r, measure);
    const filas: Celda[][] = [[header(DIMENSION_LABEL[t.dimension]), ...t.months.map((m) => header(monthLabel(m))), header('Total')]];
    for (const row of t.rows) filas.push([row.label, ...row.values, bold(row.total)]);
    filas.push([bold('Total'), ...t.totals.map(bold), bold(t.grandTotal)]);
    return {
      nombre: MEASURE_LABEL[measure],
      filas,
      anchos: [34, ...t.months.map(() => (measure === 'value' ? 14 : 10)), measure === 'value' ? 16 : 11],
      congelar: { filas: 1, columnas: 1 },
    };
  });
}

/** 'reporte comercial por cliente 2026-11-21.xlsx', con el día en hora Colombia. */
export function exportFileName(dimension: CommercialDimension, now = new Date()): string {
  const day = new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  return `reporte comercial por ${DIMENSION_LABEL[dimension].toLowerCase()} ${day}.xlsx`;
}

/** Rango por defecto: del 1° del mes de hace 11 meses a hoy (hora Colombia). */
export function defaultRange(now = new Date()): { from: string; to: string } {
  const today = new Date(now.getTime() - 5 * 3_600_000);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
  return { from: first.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}
