import { OrdenCompra } from '../../../core/api/models/pedidos.models';
import { badgeOC } from './estado-badge';
import { deliveryDay, orderDay, orderPairs, orderTotals, OrderTotals } from './oc-filters.util';

/**
 * Filas del PDF "Imprimir pedidos": la lista filtrada agrupada por cliente, con
 * subtotal por cliente y total general. El render (jsPDF) vive en oc-list-pdf.ts;
 * acá solo se arman los datos para poder probarlos sin generar el archivo.
 */

export const ORDERS_PDF_COLUMNS = [
  'Pedido', 'OC cliente', 'Fecha pedido', 'Entrega', 'Línea', 'Referencias', 'Marcas', 'Estado',
  'Pares', 'Despachados', 'Pendientes',
];

export interface OrdersPdfGroup {
  client: string;
  rows: string[][];
  subtotal: OrderTotals;
}

export interface OrdersPdfData { groups: OrdersPdfGroup[]; total: OrderTotals; }

const ddmmyyyy = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
export const pairsText = (n: number) => n.toLocaleString('es-CO');

export function orderPdfRow(oc: OrdenCompra): string[] {
  const p = orderPairs(oc);
  return [
    `OC-${oc.consecutivo}`,
    oc.ocCliente ?? '',
    ddmmyyyy(orderDay(oc)),
    ddmmyyyy(deliveryDay(oc)),
    oc.linea?.nombre ?? '',
    (oc.summary?.references ?? []).map((r) => r.codigo).join(', '),
    (oc.summary?.brands ?? []).map((b) => b.nombre).join(', '),
    badgeOC(oc.estado)?.label ?? oc.estado,
    pairsText(p.pairs),
    pairsText(p.dispatched),
    pairsText(p.pending),
  ];
}

/** Agrupa por cliente (alfabético) y, dentro de cada uno, por número de pedido. */
export function buildOrdersPdfData(ocs: OrdenCompra[]): OrdersPdfData {
  const porCliente = new Map<string, OrdenCompra[]>();
  for (const oc of ocs) {
    const nombre = oc.cliente?.nombre ?? 'Sin cliente';
    porCliente.set(nombre, [...(porCliente.get(nombre) ?? []), oc]);
  }
  const groups = [...porCliente]
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([client, lista]) => {
      const ordenados = lista.slice().sort((a, b) => a.consecutivo - b.consecutivo);
      return { client, rows: ordenados.map(orderPdfRow), subtotal: orderTotals(ordenados) };
    });
  return { groups, total: orderTotals(ocs) };
}

/** Fila de subtotal/total alineada con las columnas de pares. */
export function totalsRow(label: string, t: OrderTotals): string[] {
  const pedidos = t.orders === 1 ? '1 pedido' : `${t.orders} pedidos`;
  return [label, pedidos, '', '', '', '', '', '', pairsText(t.pairs), pairsText(t.dispatched), pairsText(t.pending)];
}

/** 'pedidos 2026-11-21.pdf', con el día en hora Colombia (UTC-5). */
export function ordersPdfFileName(ahora = new Date()): string {
  return `pedidos ${new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)}.pdf`;
}
