/**
 * Capacidad de la planta para proyectar pedidos. Datos del cliente, no del sistema.
 *
 * - 1.206 pares/día: el lote diario de corte (orden AGR del día), que es también el
 *   ritmo al que la planta entrega.
 * - Moldes de inyección (tabla de Juan Pablo, 2026-11-12): cada molde saca ~70 pares
 *   al día y acepta su talla y la anterior (el 36 acepta 34, 35 y 36). Es la
 *   restricción que le preocupa a Mauricio: un pedido cargado en una sola talla no se
 *   puede sacar de un golpe, porque esa talla solo tiene uno o dos moldes.
 *
 * ⚠️ Simplificaciones conocidas: la inyectora monta 18 moldes a la vez (de 31) y eso
 * NO se modela, porque el tope de 1.206/día ya deja el día en ~17 moldes; y hay otra
 * restricción en armado que Mauricio mencionó y falta que la expliquen.
 * Hoy es una constante: cuando haya otra planta con otros moldes pasa a la base.
 */
export interface Molde {
  /** Talla principal del molde (su nombre en planta). */
  talla: number;
  cantidad: number;
  /** Tallas que se pueden montar en esa horma. */
  acepta: number[];
}

export interface CapacidadPlanta {
  paresPorDia: number;
  /**
   * Días hábiles que tarda un par desde el día de corte hasta entrar a producto
   * terminado. JP, 2026-11-12: 10 es lo normal, porque los cortes esperan en el
   * almacén la cola de inyección; es lo que se le promete al cliente. Si un pedido
   * urgente se "jala" (se salta la cola) sale en 5 o 6 (los tiempos de Mauricio en la
   * visita del 2026-09-09 suman 5 de Preparación a PT, más el día de corte).
   */
  diasProceso: number;
  paresPorMolde: number;
  moldes: Molde[];
}

export const CAPACIDAD_AGRO: CapacidadPlanta = {
  paresPorDia: 1206,
  diasProceso: 10,
  paresPorMolde: 70,
  moldes: [
    { talla: 36, cantidad: 1, acepta: [34, 35, 36] },
    { talla: 37, cantidad: 1, acepta: [36, 37] },
    { talla: 38, cantidad: 2, acepta: [37, 38] },
    { talla: 39, cantidad: 3, acepta: [38, 39] },
    { talla: 40, cantidad: 5, acepta: [39, 40] },
    { talla: 41, cantidad: 5, acepta: [40, 41] },
    { talla: 42, cantidad: 5, acepta: [41, 42] },
    { talla: 43, cantidad: 5, acepta: [42, 43] },
    { talla: 44, cantidad: 2, acepta: [43, 44] },
    { talla: 45, cantidad: 1, acepta: [44, 45] },
    { talla: 46, cantidad: 1, acepta: [46] },
  ],
};

/** Plazo de entrega estándar que da el cliente (JP, 2026-11-12): 15 días. */
export const PLAZO_ENTREGA_DIAS = 15;
