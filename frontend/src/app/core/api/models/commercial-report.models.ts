/** Espejo de `backend/src/reportes/commercial-report-core.ts`. */
export type CommercialDimension = 'client' | 'brand' | 'reference' | 'line';
export type OrderStatus = 'BORRADOR' | 'CONFIRMADA' | 'EN_PRODUCCION' | 'CERRADA' | 'ANULADA';
export type CommercialMeasure = 'pairs' | 'dispatched' | 'value' | 'orders';

export interface Measures {
  orders: number;
  pairs: number;
  dispatched: number;
  value: number;
}

export interface PivotRow {
  key: string;
  label: string;
  cells: Record<string, Measures>;
  total: Measures;
}

export interface RankItem extends Measures {
  key: string;
  label: string;
}

export interface FilterOption {
  id: number | null;
  label: string;
}

export interface CommercialReport {
  from: string;
  to: string;
  rows: CommercialDimension;
  months: string[];
  kpis: Measures & { pending: number; unpricedPairs: number; clients: number };
  byMonth: (Measures & { month: string })[];
  topClients: RankItem[];
  topReferences: RankItem[];
  pivot: { rows: PivotRow[]; totals: { cells: Record<string, Measures>; total: Measures } };
  options: { clients: FilterOption[]; brands: FilterOption[]; references: FilterOption[]; lines: FilterOption[] };
}

export interface CommercialQuery {
  from: string;
  to: string;
  rows: CommercialDimension;
  clientIds?: number[];
  brandIds?: number[];
  referenceIds?: number[];
  lineIds?: number[];
  statuses?: OrderStatus[];
  includeStock?: boolean;
}
