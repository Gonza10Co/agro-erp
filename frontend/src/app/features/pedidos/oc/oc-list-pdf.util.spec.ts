import { OrdenCompra } from '../../../core/api/models/pedidos.models';
import { buildOrdersPdfData, ORDERS_PDF_COLUMNS, orderPdfRow, ordersPdfFileName, totalsRow } from './oc-list-pdf.util';

const oc = (o: Partial<OrdenCompra>): OrdenCompra => ({
  id: 1, consecutivo: 1, clienteId: 1, fecha: '2026-11-10T15:00:00.000Z', estado: 'CONFIRMADA',
  cliente: { id: 1, nit: '900', nombre: 'Zapatos Sur' } as any, ...o,
});

const Z2 = oc({ id: 2, consecutivo: 12, ocCliente: 'PO-77', fechaEntrega: '2026-12-01T00:00:00.000Z',
  linea: { id: 1, codigo: 'AGRO', nombre: 'Agro' },
  summary: { pairs: 1200, brands: [{ id: 1, nombre: 'Agro' }], references: [{ id: 5, codigo: '101' }, { id: 6, codigo: '105' }] },
  dispatch: { deliveries: 1, dispatchedPairs: 200, neededPairs: 1200, partial: true } });
const Z1 = oc({ id: 1, consecutivo: 3, summary: { pairs: 20, brands: [], references: [] } });
const A1 = oc({ id: 3, consecutivo: 7, cliente: { id: 2, nit: '800', nombre: 'Almacén Andes' } as any,
  summary: { pairs: 60, brands: [], references: [] } });

describe('PDF de pedidos', () => {
  it('cada fila trae las columnas en orden con pares en formato colombiano', () => {
    const r = orderPdfRow(Z2);
    expect(r.length).toBe(ORDERS_PDF_COLUMNS.length);
    expect(r).toEqual(['OC-12', 'PO-77', '10/11/2026', '01/12/2026', 'Agro', '101, 105', 'Agro', 'Confirmada', '1.200', '200', '1.000']);
  });

  it('agrupa por cliente alfabético, pedidos por número, con subtotal y total general', () => {
    const d = buildOrdersPdfData([Z2, A1, Z1]);
    expect(d.groups.map((g) => g.client)).toEqual(['Almacén Andes', 'Zapatos Sur']);
    expect(d.groups[1].rows.map((r) => r[0])).toEqual(['OC-3', 'OC-12']);
    expect(d.groups[1].subtotal).toEqual({ orders: 2, pairs: 1220, dispatched: 200, pending: 1020 });
    expect(d.total).toEqual({ orders: 3, pairs: 1280, dispatched: 200, pending: 1080 });
  });

  it('la fila de totales deja los pares en las tres últimas columnas', () => {
    const r = totalsRow('TOTAL GENERAL', { orders: 1, pairs: 1280, dispatched: 200, pending: 1080 });
    expect(r.length).toBe(ORDERS_PDF_COLUMNS.length);
    expect(r.slice(0, 2)).toEqual(['TOTAL GENERAL', '1 pedido']);
    expect(r.slice(-3)).toEqual(['1.280', '200', '1.080']);
  });

  it('nombre del archivo con el día Colombia', () => {
    expect(ordersPdfFileName(new Date('2026-11-22T03:00:00Z'))).toBe('pedidos 2026-11-21.pdf');
  });
});
