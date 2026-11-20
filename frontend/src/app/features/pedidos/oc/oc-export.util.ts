import { CalidadPT, PedidosExport } from '../../../core/api/models/pedidos.models';
import { Celda, Hoja, celdaFecha } from '../../../shared/xlsx/xlsx-mini';
import { badgeOC, badgeOP } from './estado-badge';

/**
 * El Excel de pedidos para Juan Pablo, que lo lee con Power Query: cada hoja es una
 * tabla plana (una fila de encabezados y datos debajo, sin títulos ni celdas
 * combinadas). Fechas como fecha real de Excel, cantidades y plata como número.
 */

export const COLUMNAS_PEDIDOS = [
  'Pedido', 'OC cliente', 'Cliente', 'NIT', 'Sede', 'Ciudad entrega', 'Línea', 'Tipo', 'Estado',
  'Fecha pedido cliente', 'Subido al ERP', 'Confirmado', 'Fecha entrega', 'OP', 'Estado OP',
  'Referencias', 'Marcas', 'Productos', 'Total pares', 'De bodega', 'A producir', 'Despachados',
  'Entregas', 'Pendientes', 'Valor', 'Observaciones',
];

export const COLUMNAS_TALLAS = [
  'Pedido', 'OC cliente', 'Cliente', 'NIT', 'Línea', 'Tipo', 'Estado',
  'Fecha pedido cliente', 'Subido al ERP', 'Confirmado', 'Fecha entrega',
  'Referencia', 'Marca', 'Producto', 'Código', 'Calidad', 'Talla', 'Pares pedidos',
  'De bodega', 'A producir', 'Despachados', 'Pendientes', 'OP', 'Estado OP',
  'Precio unitario', 'Valor', 'Observaciones',
];

const CALIDAD: Record<CalidadPT, string> = { PRIMERA: 'Primera', SEGUNDA: 'Segunda' };

const tipo = (paraStock: boolean) => (paraStock ? 'Mínimos' : 'Cliente');
const op = (n: number | null) => (n == null ? null : `OP-${n}`);
const encabezado = (cols: string[]): Celda[] => cols.map((t) => ({ v: t, estilo: 'encabezado' }));

export function hojasPedidos(d: PedidosExport): Hoja[] {
  const pedidos: Celda[][] = [encabezado(COLUMNAS_PEDIDOS)];
  for (const p of d.pedidos) {
    pedidos.push([
      `OC-${p.consecutivo}`, p.ocCliente, p.cliente, p.nit, p.sede, p.ciudadEntrega, p.linea,
      tipo(p.paraStock), badgeOC(p.estado)?.label ?? p.estado,
      celdaFecha(p.fechaPedidoCliente), celdaFecha(p.fechaSubida), celdaFecha(p.fechaConfirmacion), celdaFecha(p.fechaEntrega),
      op(p.opConsecutivo), p.opEstado ? badgeOP(p.opEstado)?.label ?? p.opEstado : null,
      p.referencias, p.marcas, p.productos,
      p.totalPares, p.deBodega, p.aProducir, p.despachados, p.entregas, p.pendientes, p.valor, p.observaciones,
    ]);
  }

  const tallas: Celda[][] = [encabezado(COLUMNAS_TALLAS)];
  for (const t of d.tallas) {
    tallas.push([
      `OC-${t.consecutivo}`, t.ocCliente, t.cliente, t.nit, t.linea, tipo(t.paraStock), badgeOC(t.estado)?.label ?? t.estado,
      celdaFecha(t.fechaPedidoCliente), celdaFecha(t.fechaSubida), celdaFecha(t.fechaConfirmacion), celdaFecha(t.fechaEntrega),
      t.referencia, t.marca, t.producto, t.codigo, CALIDAD[t.calidad] ?? t.calidad, t.talla, t.cantidad,
      t.deBodega, t.aProducir, t.despachados, t.pendientes,
      op(t.opConsecutivo), t.opEstado ? badgeOP(t.opEstado)?.label ?? t.opEstado : null,
      t.precioUnitario, t.valor, t.observaciones,
    ]);
  }

  return [
    {
      nombre: 'Pedidos',
      filas: pedidos,
      anchos: [9, 14, 34, 13, 14, 14, 11, 9, 14, 12, 12, 12, 12, 8, 14, 14, 24, 34, 9, 9, 9, 11, 9, 10, 13, 40],
      congelar: { filas: 1 },
    },
    {
      nombre: 'Pedidos por talla',
      filas: tallas,
      anchos: [9, 14, 34, 13, 11, 9, 14, 12, 12, 12, 12, 9, 22, 34, 12, 9, 6, 9, 9, 9, 11, 10, 8, 14, 11, 13, 40],
      congelar: { filas: 1 },
    },
  ];
}

/** 'pedidos 2026-11-19.xlsx', con el día en hora Colombia (UTC-5). */
export function nombreArchivoPedidos(ahora = new Date()): string {
  return `pedidos ${new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)}.xlsx`;
}
