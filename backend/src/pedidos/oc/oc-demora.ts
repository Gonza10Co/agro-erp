/**
 * Semáforo de "pedido quedado" para una OC. Mide la antigüedad de una orden
 * desde que se CONFIRMÓ y decide si va demorada. Lógica pura, sin BD.
 */

export type EstadoDemora = 'VERDE' | 'AMARILLO' | 'ROJO' | 'RETENIDA_CARTERA';

export interface ConfigDemora {
  diasAmarillo: number;
  diasRojo: number;
}

/** Umbrales de demora (días desde la confirmación). Punto ÚNICO de configuración. */
export const UMBRAL_DEMORA: ConfigDemora = { diasAmarillo: 20, diasRojo: 30 };

export interface ResultadoDemora {
  /** Días completos desde la confirmación; null si el reloj no aplica. */
  dias: number | null;
  /** Estado del semáforo; null si el reloj no aplica (borrador/cerrada/anulada). */
  estado: EstadoDemora | null;
}

/** Días completos entre dos fechas (piso, nunca negativo). */
export function diasTranscurridos(desde: Date, hasta: Date): number {
  const ms = hasta.getTime() - desde.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Estado de demora de una OC según los días desde su confirmación.
 * - El reloj solo corre para OCs CONFIRMADA o EN_PRODUCCION (no BORRADOR/CERRADA/ANULADA).
 * - Regla de cartera: si el cliente está VENCIDO/BLOQUEADO, la fila se marca
 *   "retenida por cartera" (neutro) en vez de roja — los días retenidos por pago
 *   no cuentan como demora nuestra (la culpa no es de la planta).
 */
export function estadoDemora(
  fechaConfirmacion: Date | null | undefined,
  ahora: Date,
  estadoCartera: string,
  estadoOC: string,
  cfg: ConfigDemora = UMBRAL_DEMORA,
): ResultadoDemora {
  const relojCorre = estadoOC === 'CONFIRMADA' || estadoOC === 'EN_PRODUCCION';
  if (!fechaConfirmacion || !relojCorre) {
    return { dias: null, estado: null };
  }
  const dias = diasTranscurridos(fechaConfirmacion, ahora);
  if (estadoCartera === 'VENCIDO' || estadoCartera === 'BLOQUEADO') {
    return { dias, estado: 'RETENIDA_CARTERA' };
  }
  if (dias >= cfg.diasRojo) return { dias, estado: 'ROJO' };
  if (dias >= cfg.diasAmarillo) return { dias, estado: 'AMARILLO' };
  return { dias, estado: 'VERDE' };
}
