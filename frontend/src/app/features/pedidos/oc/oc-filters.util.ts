import { EstadoOC, OrdenCompra } from '../../../core/api/models/pedidos.models';
import { badgeOC } from './estado-badge';

/**
 * Filtros de la lista de pedidos (reunión del 21-nov: "déjame ver los pedidos" y les
 * tocaba sumar a mano). Todo es lógica pura: la lista llega completa del backend y se
 * filtra acá; los filtros viajan en la URL para compartir el enlace o volver.
 */

export interface OrderFilters {
  /** Texto libre: nombre o NIT del cliente. */
  client: string;
  brandId: number | null;
  referenceId: number | null;
  lineId: number | null;
  status: EstadoOC | null;
  /** Rango del día del pedido (YYYY-MM-DD, incluyente). */
  orderFrom: string | null;
  orderTo: string | null;
  /** Rango de la fecha de entrega prometida (YYYY-MM-DD, incluyente). */
  deliveryFrom: string | null;
  deliveryTo: string | null;
  delayed: boolean;
  partial: boolean;
}

export const EMPTY_FILTERS: OrderFilters = {
  client: '', brandId: null, referenceId: null, lineId: null, status: null,
  orderFrom: null, orderTo: null, deliveryFrom: null, deliveryTo: null,
  delayed: false, partial: false,
};

export const ORDER_STATUSES: EstadoOC[] = ['BORRADOR', 'CONFIRMADA', 'EN_PRODUCCION', 'CERRADA', 'ANULADA'];

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const fecha = (v: string | null | undefined) => (v && DIA.test(v) ? v : null);
const entero = (v: string | null | undefined) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};

/** Lee los query params (lo que no se entiende se ignora). */
export function filtersFromParams(get: (k: string) => string | null): OrderFilters {
  const status = get('status') as EstadoOC | null;
  return {
    client: (get('client') ?? '').trim(),
    brandId: entero(get('brand')),
    referenceId: entero(get('reference')),
    lineId: entero(get('line')),
    status: status && ORDER_STATUSES.includes(status) ? status : null,
    orderFrom: fecha(get('orderFrom')),
    orderTo: fecha(get('orderTo')),
    deliveryFrom: fecha(get('deliveryFrom')),
    deliveryTo: fecha(get('deliveryTo')),
    delayed: get('delayed') === '1',
    partial: get('partial') === '1',
  };
}

/** Query params para el router: los vacíos van en null para que desaparezcan de la URL. */
export function filtersToParams(f: OrderFilters): Record<string, string | null> {
  return {
    client: f.client.trim() || null,
    brand: f.brandId ? String(f.brandId) : null,
    reference: f.referenceId ? String(f.referenceId) : null,
    line: f.lineId ? String(f.lineId) : null,
    status: f.status,
    orderFrom: f.orderFrom,
    orderTo: f.orderTo,
    deliveryFrom: f.deliveryFrom,
    deliveryTo: f.deliveryTo,
    delayed: f.delayed ? '1' : null,
    partial: f.partial ? '1' : null,
  };
}

/** Sin tildes ni mayúsculas, para buscar "garcia" y encontrar "GARCÍA". */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Día Colombia (UTC-5) de un timestamp del ERP. */
const diaColombia = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10);

/** El día en que el cliente puso el pedido; si no se registró, el día en que se subió al ERP. */
export function orderDay(oc: OrdenCompra): string {
  return oc.fechaPedidoCliente ? oc.fechaPedidoCliente.slice(0, 10) : diaColombia(oc.fecha);
}

/** Día de entrega prometido (null si el pedido no la tiene). */
export const deliveryDay = (oc: OrdenCompra): string | null => oc.fechaEntrega?.slice(0, 10) ?? null;

const enRango = (dia: string | null, desde: string | null, hasta: string | null) => {
  if (!desde && !hasta) return true;
  if (!dia) return false;
  return (!desde || dia >= desde) && (!hasta || dia <= hasta);
};

export const isDelayed = (oc: OrdenCompra) => oc.estadoDemora === 'AMARILLO' || oc.estadoDemora === 'ROJO';

/** Aplica todos los filtros a la vez. Marca y referencia entran si ALGUNA línea coincide. */
export function applyOrderFilters(ocs: OrdenCompra[], f: OrderFilters): OrdenCompra[] {
  const q = normalize(f.client);
  const lista = ocs.filter((oc) => {
    if (q) {
      const nombre = normalize(oc.cliente?.nombre ?? '');
      const nit = normalize(oc.cliente?.nit ?? '');
      if (!nombre.includes(q) && !nit.includes(q)) return false;
    }
    if (f.brandId && !oc.summary?.brands.some((b) => b.id === f.brandId)) return false;
    if (f.referenceId && !oc.summary?.references.some((r) => r.id === f.referenceId)) return false;
    if (f.lineId && (oc.linea?.id ?? oc.lineaId) !== f.lineId) return false;
    if (f.status && oc.estado !== f.status) return false;
    if (!enRango(orderDay(oc), f.orderFrom, f.orderTo)) return false;
    if (!enRango(deliveryDay(oc), f.deliveryFrom, f.deliveryTo)) return false;
    if (f.partial && !oc.dispatch?.partial) return false;
    if (f.delayed && !isDelayed(oc)) return false;
    return true;
  });
  // Las demoradas se ven con la más quedada arriba.
  return f.delayed ? lista.slice().sort((a, b) => (b.diasDemora ?? 0) - (a.diasDemora ?? 0)) : lista;
}

export interface OrderTotals { orders: number; pairs: number; dispatched: number; pending: number; }

/** Pares de un pedido: pedidos, despachados y lo que falta (anulado o cerrado no deja pendiente). */
export function orderPairs(oc: OrdenCompra): { pairs: number; dispatched: number; pending: number } {
  const pairs = oc.summary?.pairs ?? 0;
  const dispatched = oc.dispatch?.dispatchedPairs ?? 0;
  const cerrado = oc.estado === 'ANULADA' || oc.estado === 'CERRADA';
  return { pairs, dispatched, pending: cerrado ? 0 : Math.max(0, pairs - dispatched) };
}

export function orderTotals(ocs: OrdenCompra[]): OrderTotals {
  return ocs.reduce<OrderTotals>((t, oc) => {
    const p = orderPairs(oc);
    return { orders: t.orders + 1, pairs: t.pairs + p.pairs, dispatched: t.dispatched + p.dispatched, pending: t.pending + p.pending };
  }, { orders: 0, pairs: 0, dispatched: 0, pending: 0 });
}

export interface FilterOption { id: number; label: string; }
export interface FilterOptions { clients: string[]; brands: FilterOption[]; references: FilterOption[]; lines: FilterOption[]; }

/** Opciones de los selectores: solo lo que aparece en los pedidos cargados. */
export function filterOptions(ocs: OrdenCompra[]): FilterOptions {
  const clients = new Set<string>();
  const brands = new Map<number, string>();
  const references = new Map<number, string>();
  const lines = new Map<number, string>();
  for (const oc of ocs) {
    if (oc.cliente?.nombre) clients.add(oc.cliente.nombre);
    for (const b of oc.summary?.brands ?? []) brands.set(b.id, b.nombre);
    for (const r of oc.summary?.references ?? []) references.set(r.id, r.codigo);
    if (oc.linea) lines.set(oc.linea.id, oc.linea.nombre);
  }
  const ordenar = (m: Map<number, string>) =>
    [...m].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true }));
  return {
    clients: [...clients].sort((a, b) => a.localeCompare(b, 'es')),
    brands: ordenar(brands),
    references: ordenar(references),
    lines: ordenar(lines),
  };
}

export interface FilterChip { key: keyof OrderFilters | 'orderRange' | 'deliveryRange'; label: string; }

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const rango = (desde: string | null, hasta: string | null) =>
  desde && hasta ? `${ddmm(desde)} a ${ddmm(hasta)}` : desde ? `desde ${ddmm(desde)}` : `hasta ${ddmm(hasta!)}`;

/** Los filtros activos en texto: chips de la pantalla y encabezado del PDF. */
export function activeFilterChips(f: OrderFilters, o: FilterOptions): FilterChip[] {
  const nombre = (lista: FilterOption[], id: number) => lista.find((x) => x.id === id)?.label ?? `#${id}`;
  const chips: FilterChip[] = [];
  if (f.client.trim()) chips.push({ key: 'client', label: `Cliente: ${f.client.trim()}` });
  if (f.brandId) chips.push({ key: 'brandId', label: `Marca: ${nombre(o.brands, f.brandId)}` });
  if (f.referenceId) chips.push({ key: 'referenceId', label: `Referencia: ${nombre(o.references, f.referenceId)}` });
  if (f.lineId) chips.push({ key: 'lineId', label: `Línea: ${nombre(o.lines, f.lineId)}` });
  if (f.status) chips.push({ key: 'status', label: `Estado: ${badgeOC(f.status).label}` });
  if (f.orderFrom || f.orderTo) chips.push({ key: 'orderRange', label: `Pedido ${rango(f.orderFrom, f.orderTo)}` });
  if (f.deliveryFrom || f.deliveryTo) chips.push({ key: 'deliveryRange', label: `Entrega ${rango(f.deliveryFrom, f.deliveryTo)}` });
  if (f.delayed) chips.push({ key: 'delayed', label: 'Solo demoradas' });
  if (f.partial) chips.push({ key: 'partial', label: 'Con despacho parcial' });
  return chips;
}

/** Quita un filtro (la X del chip). */
export function removeFilter(f: OrderFilters, key: FilterChip['key']): OrderFilters {
  if (key === 'orderRange') return { ...f, orderFrom: null, orderTo: null };
  if (key === 'deliveryRange') return { ...f, deliveryFrom: null, deliveryTo: null };
  return { ...f, [key]: EMPTY_FILTERS[key] };
}
