/**
 * Lo que un pedido necesita de una talla de su OP, en un solo lugar. Lo leen el
 * despacho (¿está completo?), fabricación (¿a quién se reserva el par que entra a
 * PT?), la proyección (¿cuánto falta por fabricar?) y la reasignación de pares.
 *
 *   necesidad = cantAmarrada + cantAProducir − reassignedOut
 *   pendiente = necesidad − lo reservado (amarre inicial + pares que entraron a PT
 *               + pares recibidos de otro pedido − pares cedidos)
 *
 * `reassignedOut` existe porque al ceder pares a otro pedido la OP los vuelve a
 * programar (`cantAProducir` sube) sin que el cliente haya pedido más.
 */
export interface TallaNeed {
  cantAmarrada?: number | null;
  cantAProducir?: number | null;
  reassignedOut?: number | null;
}

export interface TallaConReservas extends TallaNeed {
  reservas?: { cantidad: number }[] | null;
}

export function needOf(t: TallaNeed): number {
  return (t.cantAmarrada ?? 0) + (t.cantAProducir ?? 0) - (t.reassignedOut ?? 0);
}

export function reservedOf(t: TallaConReservas): number {
  return (t.reservas ?? []).reduce((acc, r) => acc + r.cantidad, 0);
}

export function pendingOf(t: TallaConReservas): number {
  return Math.max(needOf(t) - reservedOf(t), 0);
}

/**
 * Lo que la proyección pone a fabricar. Las segundas no se fabrican a pedido
 * (salen de un defecto): un pedido de segundas que quedó debiendo no ocupa cupo de corte.
 */
export function pendingToProduce(calidad: string, t: TallaConReservas): number {
  return calidad === 'SEGUNDA' ? 0 : pendingOf(t);
}
