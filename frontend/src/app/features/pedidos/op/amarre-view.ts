import { OPLineaTalla, OrdenProduccion } from '../../../core/api/models/pedidos.models';

export interface BodegaRef { id: number; codigo: string; nombre: string; }

export interface ResumenAmarre {
  pedido: number;
  stock: number;
  producir: number;
  pctStock: number; // 0..100 redondeado
  bodegas: BodegaRef[];
  /** Pares que gerencia pasó a otro pedido o liberó: ya van sumados en `producir`. */
  cedidos: number;
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
  let pedido = 0, stock = 0, producir = 0, cedidos = 0;
  for (const t of tallas(op)) {
    pedido += t.cantPedida;
    stock += t.cantAmarrada;
    producir += t.cantAProducir;
    cedidos += t.reassignedOut ?? 0;
  }
  const pctStock = pedido > 0 ? Math.round((stock / pedido) * 100) : 0;
  return { pedido, stock, producir, pctStock, bodegas: bodegasDeOP(op), cedidos };
}

/**
 * Pares que todavía no están en bodega para este pedido: lo que necesita (amarrado +
 * a producir) menos lo ya reservado en PT. `cantAProducir` no baja al fabricar, así
 * que lo que dice si se puede despachar es esto, no "a producir".
 */
export function pendientesDeBodega(op: OrdenProduccion): number {
  let faltan = 0;
  for (const t of tallas(op)) {
    // Lo cedido a otro pedido ya está sumado en cantAProducir y no se le debe; lo ya
    // despachado (despacho parcial) salió de bodega y tampoco se le debe.
    faltan += Math.max(necesidad(t) - reservadoDe(t) - (t.dispatched ?? 0), 0);
  }
  return faltan;
}

/** Mismo cálculo que `needOf` del backend: amarrado + a producir − cedido. */
function necesidad(t: OPLineaTalla): number {
  return (t.cantAmarrada ?? 0) + (t.cantAProducir ?? 0) - (t.reassignedOut ?? 0);
}

function reservadoDe(t: OPLineaTalla): number {
  return (t.reservas ?? []).reduce((a, r) => a + r.cantidad, 0);
}

/** Pares de la OP que ya salieron en despachos (parciales o el total). */
export function despachadoTotal(op: OrdenProduccion): number {
  return tallas(op).reduce((a, t) => a + (t.dispatched ?? 0), 0);
}

/** Pares reservados en bodega PT para la OP: es lo único que se puede despachar. */
export function reservadoTotal(op: OrdenProduccion): number {
  return tallas(op).reduce((a, t) => a + reservadoDe(t), 0);
}

/** Un renglón del formulario de despacho: una talla de un producto de la OP. */
export interface FilaDespacho {
  opLineaTallaId: number;
  producto: string;
  calidad: 'PRIMERA' | 'SEGUNDA';
  talla: number;
  /** Lo que la OP necesita de la talla y todavía no ha salido. */
  porDespachar: number;
  /** Tope de lo que se puede despachar ahora (lo que está en bodega para la OP). */
  reservado: number;
  /** Ya despachado en despachos anteriores. */
  despachado: number;
}

/** Tallas con algo reservado en bodega, en orden de producto y talla. */
export function filasDespacho(op: OrdenProduccion): FilaDespacho[] {
  const filas: FilaDespacho[] = [];
  for (const l of op.lineas ?? []) {
    for (const t of l.tallas ?? []) {
      const reservado = reservadoDe(t);
      if (reservado <= 0) continue;
      filas.push({
        opLineaTallaId: t.id,
        producto: l.productoConfigurado?.nombreComercial ?? `Producto ${l.productoConfiguradoId}`,
        calidad: l.calidad ?? 'PRIMERA',
        talla: t.talla?.valor ?? t.tallaId,
        porDespachar: Math.max(necesidad(t) - (t.dispatched ?? 0), 0),
        reservado,
        despachado: t.dispatched ?? 0,
      });
    }
  }
  return filas.sort((a, b) => a.producto.localeCompare(b.producto) || a.calidad.localeCompare(b.calidad) || a.talla - b.talla);
}

/** ¿Con estas cantidades (opLineaTallaId → pares) sale todo lo que la OP debe? Así decide el backend si la cierra. */
export function despachoCierraOP(op: OrdenProduccion, cantidades: Record<number, number>): boolean {
  return tallas(op).every((t) => (t.dispatched ?? 0) + (cantidades[t.id] ?? 0) >= necesidad(t));
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
