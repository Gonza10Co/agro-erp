import { EstacionDef, inicioDelDiaBogota } from './fabricacion-core';

/** Un evento con lo necesario para contarlo y desglosarlo. */
export interface StationEntry {
  parId: number;
  station: string | null;
  timestamp: Date;
  /** Sin pistolazo real: estación saltada o par movido en lote. */
  inferred: boolean;
  ofId: number;
  ofNumber: number;
  productId: number;
  product: string;
  sizeId: number;
  size: number;
  sizeOrder: number;
}

export interface DaySize {
  sizeId: number;
  size: number;
  pairs: number;
  inferred: number;
}
export interface DayOrder {
  ofId: number;
  ofNumber: number;
  productId: number;
  product: string;
  pairs: number;
  inferred: number;
  sizes: DaySize[];
}
export interface DayStation {
  code: string;
  name: string;
  active: boolean;
  /** Pares distintos que entraron, incluidos los inferidos (igual que la TV). */
  pairs: number;
  /** De esos, cuántos entraron sin ningún pistolazo real. */
  inferred: number;
  /** Primer y último pistolazo REAL; null si todo fue inferido o no hubo nada. */
  firstAt: string | null;
  lastAt: string | null;
  orders: DayOrder[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fecha civil de Bogotá (YYYY-MM-DD) en que cae un instante. */
export function bogotaDate(at: Date): string {
  return inicioDelDiaBogota(at).toISOString().slice(0, 10);
}

/**
 * `[start, end)` del día civil de Bogotá como instantes UTC; null si la fecha no tiene
 * formato YYYY-MM-DD o no existe en el calendario.
 */
export function bogotaDayRange(date: unknown): { start: Date; end: Date } | null {
  if (typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date)) return null;
  // Al mediodía UTC: cae en el mismo día de Bogotá sin rozar el límite.
  const noon = new Date(`${date}T12:00:00Z`);
  // JS corre el 30 de febrero al 2 de marzo: si no vuelve igual, la fecha no existe.
  if (Number.isNaN(noon.getTime()) || noon.toISOString().slice(0, 10) !== date) return null;
  const start = inicioDelDiaBogota(noon);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Acumula pares distintos: un par es inferido solo si ninguno de sus eventos fue real. */
function countPairs(entries: readonly StationEntry[]): { pairs: number; inferred: number } {
  const real = new Set<number>();
  const all = new Set<number>();
  for (const e of entries) {
    all.add(e.parId);
    if (!e.inferred) real.add(e.parId);
  }
  return { pairs: all.size, inferred: all.size - real.size };
}

function groupBy<T, K>(items: readonly T[], key: (t: T) => K): T[][] {
  const groups = new Map<K, T[]>();
  for (const it of items) {
    const g = groups.get(key(it));
    if (g) g.push(it);
    else groups.set(key(it), [it]);
  }
  return [...groups.values()];
}

/**
 * Producción de un día por estación: pares distintos que ENTRARON (el pistolazo es de
 * entrada), con las reglas de la TV (`avanceHoyPorEstacion`: sin eventos fuera del día
 * ni posteriores a `now`). Las estaciones apagadas salen solo si ese día registraron.
 */
export function productionByDay(
  entries: readonly StationEntry[],
  stations: readonly EstacionDef[],
  range: { start: Date; end: Date },
  now: Date,
): DayStation[] {
  const valid = entries.filter((e) => {
    const t = e.timestamp.getTime();
    return t >= range.start.getTime() && t < range.end.getTime() && t <= now.getTime();
  });
  return [...stations]
    .sort((a, b) => a.orden - b.orden)
    .map((st) => {
      const own = valid.filter((e) => e.station === st.codigo);
      const times = own.filter((e) => !e.inferred).map((e) => e.timestamp.getTime()).sort((a, b) => a - b);
      return {
        code: st.codigo,
        name: st.nombre,
        active: st.activa,
        ...countPairs(own),
        firstAt: times.length ? new Date(times[0]).toISOString() : null,
        lastAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
        orders: breakdown(own),
      };
    })
    .filter((s) => s.active || s.pairs > 0);
}

function breakdown(entries: readonly StationEntry[]): DayOrder[] {
  return groupBy(entries, (e) => `${e.ofId}-${e.productId}`)
    .map((g) => ({
      ofId: g[0].ofId,
      ofNumber: g[0].ofNumber,
      productId: g[0].productId,
      product: g[0].product,
      ...countPairs(g),
      sizes: groupBy(g, (e) => e.sizeId)
        .sort((a, b) => a[0].sizeOrder - b[0].sizeOrder)
        .map((s) => ({ sizeId: s[0].sizeId, size: s[0].size, ...countPairs(s) })),
    }))
    .sort((a, b) => a.ofNumber - b.ofNumber || a.product.localeCompare(b.product, 'es'));
}

