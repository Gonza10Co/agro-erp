/**
 * Reporte comercial (reunión del 21-nov-2026, para Alejandra y gerencia): pedidos por
 * cliente y por mes, con filtros tipo tabla dinámica. Lógica pura, sin Prisma: el
 * servicio arma los "hechos" (uno por pedido × producto × calidad) y acá se filtran y
 * se agregan.
 *
 * Reglas:
 * - El mes del pedido es el día en que el cliente lo puso (`fechaPedidoCliente`) y, si
 *   no está, el día en que se subió al ERP (hora Colombia).
 * - Los despachados se cuentan en el mes del PEDIDO (es "qué tanto de lo que se pidió
 *   en marzo ya salió"), no en el mes del despacho.
 * - El valor solo suma renglones con precio; los pares sin precio se reportan aparte
 *   para que nadie lea el valor como completo.
 * - Pedidos (número) es un conteo de pedidos DISTINTOS: un pedido con dos marcas
 *   cuenta una vez en el total y una vez en cada marca.
 * - Sin filtro de estado solo cuentan las ventas en firme (confirmadas, en producción y
 *   cerradas): BORRADOR y ANULADA solo entran si se piden explícito.
 * - Los pedidos de mínimos de stock (`paraStock`) no son ventas: quedan fuera salvo
 *   `includeStock`.
 */

export const COMMERCIAL_DIMENSIONS = ['client', 'brand', 'reference', 'line'] as const;
export type CommercialDimension = (typeof COMMERCIAL_DIMENSIONS)[number];

export const ORDER_STATUSES = ['BORRADOR', 'CONFIRMADA', 'EN_PRODUCCION', 'CERRADA', 'ANULADA'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Estados por defecto: las ventas en firme (sin borradores ni anuladas). */
export const DEFAULT_STATUSES: OrderStatus[] = ['CONFIRMADA', 'EN_PRODUCCION', 'CERRADA'];

export interface CommercialFact {
  orderId: number;
  /** 'YYYY-MM' */
  month: string;
  status: OrderStatus;
  /** Pedido de mínimos de stock (no es venta). */
  forStock: boolean;
  clientId: number;
  clientName: string;
  brandId: number;
  brandName: string;
  referenceId: number;
  referenceName: string;
  /** null = pedido sin línea (ni en la OC ni en la marca). */
  lineId: number | null;
  lineName: string;
  pairs: number;
  dispatched: number;
  /** Valor de los pares con precio (0 si el renglón no trae precio). */
  value: number;
  /** Pares de renglones SIN precio (no suman en `value`). */
  unpricedPairs: number;
}

export interface CommercialFilters {
  clientIds?: number[];
  brandIds?: number[];
  referenceIds?: number[];
  lineIds?: number[];
  statuses?: OrderStatus[];
  /** Incluir los pedidos de mínimos de stock (por defecto no). */
  includeStock?: boolean;
}

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

export interface Option {
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
  options: {
    clients: Option[];
    brands: Option[];
    references: Option[];
    lines: Option[];
  };
}

/** Acumulador con el conjunto de pedidos para contar distintos. */
class Acc {
  private readonly ids = new Set<number>();
  pairs = 0;
  dispatched = 0;
  value = 0;
  add(f: CommercialFact) {
    this.ids.add(f.orderId);
    this.pairs += f.pairs;
    this.dispatched += f.dispatched;
    this.value += f.value;
  }
  toMeasures(): Measures {
    return { orders: this.ids.size, pairs: this.pairs, dispatched: this.dispatched, value: round2(this.value) };
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Meses 'YYYY-MM' de `from` a `to` inclusive (ambos 'YYYY-MM-DD' o 'YYYY-MM'). */
export function monthRange(from: string, to: string): string[] {
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ty = Number(to.slice(0, 4));
  const tm = Number(to.slice(5, 7));
  const out: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 120) break; // tope defensivo: 10 años
  }
  return out;
}

export function dimensionKey(f: CommercialFact, d: CommercialDimension): { key: string; label: string } {
  switch (d) {
    case 'client': return { key: String(f.clientId), label: f.clientName };
    case 'brand': return { key: String(f.brandId), label: f.brandName };
    case 'reference': return { key: String(f.referenceId), label: f.referenceName };
    case 'line': return { key: f.lineId == null ? 'none' : String(f.lineId), label: f.lineName };
  }
}

const inList = <T>(list: T[] | undefined, v: T) => !list || list.length === 0 || list.includes(v);

export function filterFacts(facts: CommercialFact[], f: CommercialFilters): CommercialFact[] {
  const statuses = f.statuses && f.statuses.length ? f.statuses : DEFAULT_STATUSES;
  return facts.filter(
    (x) =>
      statuses.includes(x.status) &&
      (f.includeStock || !x.forStock) &&
      inList(f.clientIds, x.clientId) &&
      inList(f.brandIds, x.brandId) &&
      inList(f.referenceIds, x.referenceId) &&
      // El filtro de línea usa 0 para "sin línea".
      inList(f.lineIds, x.lineId ?? 0),
  );
}

function options(facts: CommercialFact[]) {
  const collect = (pick: (f: CommercialFact) => [number | null, string]) => {
    const m = new Map<number | null, string>();
    for (const f of facts) {
      const [id, label] = pick(f);
      if (!m.has(id)) m.set(id, label);
    }
    return [...m.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  };
  return {
    clients: collect((f) => [f.clientId, f.clientName]),
    brands: collect((f) => [f.brandId, f.brandName]),
    references: collect((f) => [f.referenceId, f.referenceName]),
    lines: collect((f) => [f.lineId ?? 0, f.lineName]),
  };
}

function rank(facts: CommercialFact[], d: CommercialDimension, top: number): RankItem[] {
  const m = new Map<string, { label: string; acc: Acc }>();
  for (const f of facts) {
    const { key, label } = dimensionKey(f, d);
    let e = m.get(key);
    if (!e) { e = { label, acc: new Acc() }; m.set(key, e); }
    e.acc.add(f);
  }
  return [...m.entries()]
    .map(([key, e]) => ({ key, label: e.label, ...e.acc.toMeasures() }))
    .sort((a, b) => b.pairs - a.pairs || b.value - a.value || a.label.localeCompare(b.label, 'es'))
    .slice(0, top);
}

const empty = (): Measures => ({ orders: 0, pairs: 0, dispatched: 0, value: 0 });

/**
 * Arma el reporte. `allFacts` son los hechos del rango de fechas (sin otros filtros):
 * de ahí salen las opciones de los filtros, así un filtro no esconde sus alternativas.
 */
export function buildCommercialReport(
  allFacts: CommercialFact[],
  opts: { from: string; to: string; rows: CommercialDimension; filters: CommercialFilters; top?: number },
): CommercialReport {
  const months = monthRange(opts.from, opts.to);
  const facts = filterFacts(allFacts, opts.filters).filter((f) => months.includes(f.month));
  const top = opts.top ?? 8;

  const total = new Acc();
  const byMonthAcc = new Map<string, Acc>(months.map((m) => [m, new Acc()]));
  const rowsAcc = new Map<string, { label: string; total: Acc; cells: Map<string, Acc> }>();
  let unpricedPairs = 0;
  const clients = new Set<number>();

  for (const f of facts) {
    total.add(f);
    byMonthAcc.get(f.month)!.add(f);
    unpricedPairs += f.unpricedPairs;
    clients.add(f.clientId);
    const { key, label } = dimensionKey(f, opts.rows);
    let r = rowsAcc.get(key);
    if (!r) { r = { label, total: new Acc(), cells: new Map() }; rowsAcc.set(key, r); }
    r.total.add(f);
    let c = r.cells.get(f.month);
    if (!c) { c = new Acc(); r.cells.set(f.month, c); }
    c.add(f);
  }

  const pivotRows: PivotRow[] = [...rowsAcc.entries()]
    .map(([key, r]) => {
      const cells: Record<string, Measures> = {};
      for (const m of months) cells[m] = r.cells.get(m)?.toMeasures() ?? empty();
      return { key, label: r.label, cells, total: r.total.toMeasures() };
    })
    .sort((a, b) => b.total.pairs - a.total.pairs || a.label.localeCompare(b.label, 'es'));

  const byMonth = months.map((month) => ({ month, ...byMonthAcc.get(month)!.toMeasures() }));
  const totalCells: Record<string, Measures> = {};
  for (const b of byMonth) {
    const { month, ...rest } = b;
    totalCells[month] = rest;
  }
  const t = total.toMeasures();

  return {
    from: opts.from,
    to: opts.to,
    rows: opts.rows,
    months,
    kpis: { ...t, pending: Math.max(0, t.pairs - t.dispatched), unpricedPairs, clients: clients.size },
    byMonth,
    topClients: rank(facts, 'client', top),
    topReferences: rank(facts, 'reference', top),
    pivot: { rows: pivotRows, totals: { cells: totalCells, total: t } },
    options: options(allFacts.filter((f) => months.includes(f.month))),
  };
}

/** Día 'YYYY-MM-DD' en hora Colombia (UTC-5) de un instante. */
export function colombiaDay(d: Date): string {
  return new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}

/** Mes del pedido: el día del cliente si existe (es @db.Date, sin hora), si no la subida. */
export function orderMonth(fechaPedidoCliente: Date | null, fecha: Date): string {
  return (fechaPedidoCliente ? fechaPedidoCliente.toISOString().slice(0, 10) : colombiaDay(fecha)).slice(0, 7);
}
