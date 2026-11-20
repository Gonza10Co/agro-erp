/**
 * Despacho parcial (JP, 2026-11-19: "no son a diario pero sí muy recurrentes").
 * Lógica pura, sin BD: qué reservas de la OP se consumen y cuánto sube lo
 * despachado de cada talla.
 *
 * Solo sale lo que la OP tiene RESERVADO en bodega PT: lo que todavía se está
 * fabricando no se puede despachar. Dentro de una talla se consume primero la
 * bodega principal (menor prioridad), igual que el amarre y la reasignación.
 */
import { CalidadPT } from './despacho-lineas';
import { needOf, dispatchedOf } from '../pedidos/op/op-need';

export interface ReservaDeTalla {
  reservaId: number;
  inventarioPTId: number;
  bodegaId: number;
  /** Prioridad de la bodega: menor = principal. */
  prioridad: number;
  calidad: CalidadPT;
  cantidad: number;
}

export interface TallaDespachable {
  opLineaTallaId: number;
  productoConfiguradoId: number;
  tallaId: number;
  cantAmarrada?: number | null;
  cantAProducir?: number | null;
  reassignedOut?: number | null;
  dispatched?: number | null;
  reservas: ReservaDeTalla[];
}

export interface DispatchLine {
  opLineaTallaId: number;
  quantity: number;
}

export interface DispatchTake {
  reservaId: number;
  opLineaTallaId: number;
  inventarioPTId: number;
  productoConfiguradoId: number;
  tallaId: number;
  bodegaId: number;
  calidad: CalidadPT;
  /** Lo que sale de esta reserva. */
  cantidad: number;
  /** Lo que la reserva tenía al leerla: si cambió en el medio, el despacho se cae (409). */
  reservaCantidad: number;
}

export interface DispatchPlan {
  takes: DispatchTake[];
  /** opLineaTallaId → pares que salen en este despacho. */
  perTalla: Map<number, number>;
  total: number;
  /** ¿Con este despacho lo despachado cubre la necesidad de todas las tallas? */
  closesOp: boolean;
}

export class DispatchError extends Error {}

/**
 * Sin `lines` es el despacho de siempre: sale TODO lo reservado.
 * Con `lines` sale solo lo pedido por talla (cantidad 0 = esa talla no sale).
 */
export function planDispatch(tallas: TallaDespachable[], lines?: DispatchLine[] | null): DispatchPlan {
  const porId = new Map(tallas.map((t) => [t.opLineaTallaId, t]));
  const reservado = (t: TallaDespachable) => t.reservas.reduce((a, r) => a + r.cantidad, 0);

  const pedido = new Map<number, number>();
  if (lines == null) {
    for (const t of tallas) pedido.set(t.opLineaTallaId, reservado(t));
  } else {
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity < 0)
        throw new DispatchError('Las cantidades a despachar deben ser números enteros de pares, sin negativos');
      if (pedido.has(l.opLineaTallaId)) throw new DispatchError('Una talla viene repetida en el despacho');
      const t = porId.get(l.opLineaTallaId);
      if (!t) throw new DispatchError('Una de las tallas no pertenece a este pedido');
      const r = reservado(t);
      if (l.quantity > r)
        throw new DispatchError(
          `De la talla solo hay ${r} pares reservados en bodega para este pedido; no se pueden despachar ${l.quantity}`,
        );
      pedido.set(l.opLineaTallaId, l.quantity);
    }
  }

  const takes: DispatchTake[] = [];
  const perTalla = new Map<number, number>();
  for (const t of tallas) {
    let resto = pedido.get(t.opLineaTallaId) ?? 0;
    if (resto <= 0) continue;
    perTalla.set(t.opLineaTallaId, resto);
    const orden = [...t.reservas].sort((a, b) => a.prioridad - b.prioridad || a.reservaId - b.reservaId);
    for (const r of orden) {
      if (resto <= 0) break;
      const c = Math.min(resto, r.cantidad);
      if (c <= 0) continue;
      takes.push({
        reservaId: r.reservaId,
        opLineaTallaId: t.opLineaTallaId,
        inventarioPTId: r.inventarioPTId,
        productoConfiguradoId: t.productoConfiguradoId,
        tallaId: t.tallaId,
        bodegaId: r.bodegaId,
        calidad: r.calidad,
        cantidad: c,
        reservaCantidad: r.cantidad,
      });
      resto -= c;
    }
  }

  const total = [...perTalla.values()].reduce((a, b) => a + b, 0);
  if (total === 0)
    throw new DispatchError(
      lines == null ? 'El pedido no tiene pares reservados en bodega para despachar' : 'Elige al menos un par para despachar',
    );

  // Orden canónico de locks (por fila de inventario): dos despachos, o un despacho y
  // una reasignación, que tocan las mismas filas las bloquean en el mismo orden.
  takes.sort((a, b) => a.inventarioPTId - b.inventarioPTId || a.reservaId - b.reservaId);

  return { takes, perTalla, total, closesOp: closesOp(tallas, perTalla) };
}

/** ¿Lo despachado (más lo que sale ahora) cubre la necesidad de cada talla? */
export function closesOp(tallas: TallaDespachable[], ahora: Map<number, number> = new Map()): boolean {
  return tallas.every((t) => dispatchedOf(t) + (ahora.get(t.opLineaTallaId) ?? 0) >= needOf(t));
}
