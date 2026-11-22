import { OrdenCompra } from '../../../core/api/models/pedidos.models';
import {
  EMPTY_FILTERS, activeFilterChips, applyOrderFilters, filterOptions, filtersFromParams,
  filtersToParams, orderDay, orderTotals, removeFilter,
} from './oc-filters.util';

const oc = (o: Partial<OrdenCompra>): OrdenCompra => ({
  id: 1, consecutivo: 1, clienteId: 1, fecha: '2026-11-10T15:00:00.000Z', estado: 'CONFIRMADA',
  cliente: { id: 1, nit: '900111', nombre: 'ACME' } as any, ...o,
});

const A = oc({
  id: 1, consecutivo: 1, fechaPedidoCliente: '2026-11-05T00:00:00.000Z', fechaEntrega: '2026-12-01T00:00:00.000Z',
  linea: { id: 4, codigo: 'FEROZ', nombre: 'Feroz' },
  summary: { pairs: 100, brands: [{ id: 2, nombre: 'Agro' }, { id: 3, nombre: 'Basarili' }], references: [{ id: 5, codigo: '101' }] },
  dispatch: { deliveries: 1, dispatchedPairs: 40, neededPairs: 100, partial: true },
  estadoDemora: 'ROJO', diasDemora: 20,
});
const B = oc({
  id: 2, consecutivo: 2, estado: 'BORRADOR', cliente: { id: 2, nit: '800', nombre: 'Botas GARCÍA' } as any,
  fecha: '2026-11-20T03:00:00.000Z', // 19-nov en Colombia
  summary: { pairs: 30, brands: [{ id: 3, nombre: 'Basarili' }], references: [{ id: 6, codigo: '105' }] },
  dispatch: null, estadoDemora: 'AMARILLO', diasDemora: 25,
});
const C = oc({
  id: 3, consecutivo: 3, estado: 'ANULADA', fechaEntrega: '2026-11-25T00:00:00.000Z',
  summary: { pairs: 50, brands: [], references: [{ id: 5, codigo: '101' }] }, dispatch: null,
});
const TODOS = [A, B, C];
const ids = (l: OrdenCompra[]) => l.map((o) => o.id);

describe('applyOrderFilters', () => {
  it('sin filtros devuelve todo', () => {
    expect(ids(applyOrderFilters(TODOS, EMPTY_FILTERS))).toEqual([1, 2, 3]);
  });

  it('cliente: busca por nombre sin tildes ni mayúsculas y por NIT', () => {
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, client: 'garcia' }))).toEqual([2]);
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, client: '900111' }))).toEqual([1, 3]);
  });

  it('marca y referencia: entra si alguna línea coincide', () => {
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, brandId: 3 }))).toEqual([1, 2]);
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, referenceId: 5 }))).toEqual([1, 3]);
  });

  it('línea y estado', () => {
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, lineId: 4 }))).toEqual([1]);
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, status: 'ANULADA' }))).toEqual([3]);
  });

  it('fecha del pedido: usa la del cliente y si no hay, el día Colombia de subida', () => {
    expect(orderDay(B)).toBe('2026-11-19');
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, orderFrom: '2026-11-01', orderTo: '2026-11-09' }))).toEqual([1]);
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, orderFrom: '2026-11-19' }))).toEqual([2]);
  });

  it('fecha de entrega: los pedidos sin fecha de entrega quedan fuera del rango', () => {
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, deliveryTo: '2026-11-30' }))).toEqual([3]);
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, deliveryFrom: '2026-11-25', deliveryTo: '2026-12-01' }))).toEqual([1, 3]);
  });

  it('se combinan, y demoradas ordena la más quedada arriba', () => {
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, brandId: 3, partial: true }))).toEqual([1]);
    expect(ids(applyOrderFilters(TODOS, { ...EMPTY_FILTERS, delayed: true }))).toEqual([2, 1]);
  });
});

describe('orderTotals', () => {
  it('suma pedidos y pares; lo anulado no deja pendiente', () => {
    expect(orderTotals(TODOS)).toEqual({ orders: 3, pairs: 180, dispatched: 40, pending: 90 });
    expect(orderTotals([])).toEqual({ orders: 0, pairs: 0, dispatched: 0, pending: 0 });
  });
});

describe('query params', () => {
  it('ida y vuelta, ignorando lo inválido', () => {
    const f = { ...EMPTY_FILTERS, client: 'acme', brandId: 2, status: 'BORRADOR' as const, orderFrom: '2026-11-01', partial: true };
    const params = filtersToParams(f);
    expect(params['line']).toBeNull();
    expect(filtersFromParams((k) => params[k] ?? null)).toEqual(f);
    const malos: Record<string, string> = { brand: 'x', status: 'NADA', orderFrom: '01/11/2026', delayed: 'si' };
    expect(filtersFromParams((k) => malos[k] ?? null)).toEqual(EMPTY_FILTERS);
  });
});

describe('chips y opciones', () => {
  it('opciones solo con lo que aparece en los pedidos, ordenadas', () => {
    const o = filterOptions(TODOS);
    expect(o.clients).toEqual(['ACME', 'Botas GARCÍA']);
    expect(o.brands.map((b) => b.label)).toEqual(['Agro', 'Basarili']);
    expect(o.references.map((r) => r.label)).toEqual(['101', '105']);
    expect(o.lines).toEqual([{ id: 4, label: 'Feroz' }]);
  });

  it('arma los chips con nombres legibles y quitar un rango borra las dos puntas', () => {
    const f = { ...EMPTY_FILTERS, brandId: 2, deliveryFrom: '2026-11-01', deliveryTo: '2026-11-30', delayed: true };
    const chips = activeFilterChips(f, filterOptions(TODOS));
    expect(chips.map((c) => c.label)).toEqual(['Marca: Agro', 'Entrega 01/11/2026 a 30/11/2026', 'Solo demoradas']);
    const sinRango = removeFilter(f, 'deliveryRange');
    expect(sinRango.deliveryFrom).toBeNull();
    expect(sinRango.deliveryTo).toBeNull();
    expect(removeFilter(f, 'brandId').brandId).toBeNull();
  });
});
