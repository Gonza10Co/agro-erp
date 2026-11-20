/**
 * Resumen del despacho de una OP para las listas de pedidos (JP, 2026-11-20: "si a un
 * cliente ya se le empezó a despachar"). Lógica pura: el servicio trae en UNA consulta
 * el conteo de despachos y las tallas de cada OP, y esto lo resume.
 */
import { dispatchedOf, needOf, TallaNeed } from '../pedidos/op/op-need';

export interface OpParaResumen {
  estado: string;
  _count?: { despachos?: number } | null;
  lineas?: { tallas?: TallaNeed[] | null }[] | null;
}

export interface DispatchSummary {
  /** Cuántos despachos (entregas) lleva la OP. */
  deliveries: number;
  /** Pares que ya salieron. */
  dispatchedPairs: number;
  /** Pares que el pedido necesita en total. */
  neededPairs: number;
  /** Ya salió algo pero el pedido sigue abierto (ni despachado completo ni anulado). */
  partial: boolean;
}

export function dispatchSummary(op: OpParaResumen): DispatchSummary {
  const tallas = (op.lineas ?? []).flatMap((l) => l.tallas ?? []);
  const dispatchedPairs = tallas.reduce((a, t) => a + dispatchedOf(t), 0);
  const neededPairs = tallas.reduce((a, t) => a + Math.max(needOf(t), 0), 0);
  const abierta = op.estado !== 'DESPACHADA' && op.estado !== 'ANULADA';
  return {
    deliveries: op._count?.despachos ?? 0,
    dispatchedPairs,
    neededPairs,
    partial: abierta && dispatchedPairs > 0,
  };
}

/** Lo que el select de Prisma necesita para armar el resumen (sin N+1). */
export const DISPATCH_SUMMARY_SELECT = {
  _count: { select: { despachos: true } },
  lineas: {
    select: {
      tallas: { select: { cantAmarrada: true, cantAProducir: true, reassignedOut: true, dispatched: true } },
    },
  },
} as const;
