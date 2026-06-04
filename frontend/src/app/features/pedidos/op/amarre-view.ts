import { OrdenProduccion } from '../../../core/api/models/pedidos.models';

export interface BodegaRef { id: number; codigo: string; nombre: string; }

export interface ResumenAmarre {
  pedido: number;
  stock: number;
  producir: number;
  pctStock: number; // 0..100 redondeado
  bodegas: BodegaRef[];
}

export interface TallaFila {
  tallaId: number;
  valor: number;
  pedido: number;
  stock: number;
  producir: number;
  completo: boolean;
  wBar: number;   // ancho total de la barra = pedido/maxPedido*100
  wStock: number; // % del ancho de celda ocupado por stock
  wProd: number;  // % del ancho de celda ocupado por producir
}

export interface BodegaFila {
  tallaId: number;
  valor: number;
  pedido: number;
  porBodega: Record<number, number>; // bodegaId -> stock reservado
  stock: number;
  producir: number;
}

function tallas(op: OrdenProduccion) {
  return (op.lineas ?? []).flatMap(l => l.tallas ?? []);
}

export function bodegasDeOP(op: OrdenProduccion): BodegaRef[] {
  const map = new Map<number, BodegaRef>();
  for (const t of tallas(op)) {
    for (const r of t.reservas ?? []) {
      const b = r.inventarioPT?.bodega;
      if (b && !map.has(b.id)) map.set(b.id, { id: b.id, codigo: b.codigo, nombre: b.nombre });
    }
  }
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export function resumenAmarre(op: OrdenProduccion): ResumenAmarre {
  let pedido = 0, stock = 0, producir = 0;
  for (const t of tallas(op)) {
    pedido += t.cantPedida;
    stock += t.cantAmarrada;
    producir += t.cantAProducir;
  }
  const pctStock = pedido > 0 ? Math.round((stock / pedido) * 100) : 0;
  return { pedido, stock, producir, pctStock, bodegas: bodegasDeOP(op) };
}

function agregarPorTalla(op: OrdenProduccion) {
  const map = new Map<number, { valor: number; pedido: number; stock: number; producir: number }>();
  for (const t of tallas(op)) {
    const prev = map.get(t.tallaId) ?? { valor: t.talla?.valor ?? t.tallaId, pedido: 0, stock: 0, producir: 0 };
    prev.pedido += t.cantPedida;
    prev.stock += t.cantAmarrada;
    prev.producir += t.cantAProducir;
    map.set(t.tallaId, prev);
  }
  return [...map.entries()]
    .map(([tallaId, v]) => ({ tallaId, ...v }))
    .sort((a, b) => a.valor - b.valor);
}

export function filasPorTalla(op: OrdenProduccion): TallaFila[] {
  const base = agregarPorTalla(op);
  const maxPedido = Math.max(1, ...base.map(b => b.pedido));
  return base.map(b => ({
    tallaId: b.tallaId,
    valor: b.valor,
    pedido: b.pedido,
    stock: b.stock,
    producir: b.producir,
    completo: b.producir === 0,
    wBar: Math.round((b.pedido / maxPedido) * 100),
    wStock: b.pedido > 0 ? Math.round((b.stock / b.pedido) * 100) : 0,
    wProd: b.pedido > 0 ? Math.round((b.producir / b.pedido) * 100) : 0,
  }));
}

export function filasPorBodega(op: OrdenProduccion): BodegaFila[] {
  const map = new Map<number, BodegaFila>();
  for (const t of tallas(op)) {
    const fila = map.get(t.tallaId) ?? {
      tallaId: t.tallaId, valor: t.talla?.valor ?? t.tallaId,
      pedido: 0, porBodega: {}, stock: 0, producir: 0,
    };
    fila.pedido += t.cantPedida;
    fila.stock += t.cantAmarrada;
    fila.producir += t.cantAProducir;
    for (const r of t.reservas ?? []) {
      const id = r.inventarioPT?.bodega?.id;
      if (id != null) fila.porBodega[id] = (fila.porBodega[id] ?? 0) + r.cantidad;
    }
    map.set(t.tallaId, fila);
  }
  return [...map.values()].sort((a, b) => a.valor - b.valor);
}
