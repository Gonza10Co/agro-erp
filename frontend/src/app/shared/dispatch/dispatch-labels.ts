import { DispatchSummary } from '../../core/api/models/pedidos.models';

/**
 * Textos del despacho parcial (JP, 2026-11-20: "si muestra la etiqueta despacho
 * parcial al igual que el número de entrega en la factura tendríamos información
 * valiosa"). Un solo lugar para que lista, detalle y factura digan lo mismo.
 */

/** "Entrega 2", y "Entrega 3 (final)" para la que cerró el pedido. */
export function deliveryLabel(n: number | null | undefined, isFinal?: boolean | null): string | null {
  if (!n) return null;
  return `Entrega ${n}${isFinal ? ' (final)' : ''}`;
}

/** "2 entregas · 12 de 20 pares" para el chip de la lista de pedidos. */
export function dispatchDetail(s: DispatchSummary): string {
  const entregas = s.deliveries === 1 ? '1 entrega' : `${s.deliveries} entregas`;
  const fmt = (n: number) => n.toLocaleString('es-CO');
  return `${entregas} · ${fmt(s.dispatchedPairs)} de ${fmt(s.neededPairs)} pares`;
}

/** El chip solo sale si el pedido ya empezó a despacharse y sigue abierto. */
export function partialDispatch(s: DispatchSummary | null | undefined): DispatchSummary | null {
  return s?.partial ? s : null;
}
