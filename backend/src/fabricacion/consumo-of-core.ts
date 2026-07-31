/**
 * Núcleo puro del consumo real de materiales por OF. Sin Prisma ni Nest.
 *
 * El almacenista registra a mano lo que entregó a la OF (decisión del cliente,
 * 2026-07-29: NO hay backflush contra el BOM). Este archivo resuelve las dos
 * cuentas delicadas de ese registro:
 *
 *  1. cómo se descarga el consumo contra la reserva que el pedido dejó amarrada,
 *  2. cómo se compara lo entregado contra lo que el BOM decía que iba a costar.
 */

/** Lo mínimo que hace falta de una línea de requerimiento con reserva viva. */
export interface LineaReservaMin {
  id: number;
  cantReservada: number;
}

export interface DescargaDeReserva {
  /** Cuánto baja el agregado `InventarioMaterial.cantReservada`. */
  total: number;
  /** Cuánto baja cada `RequerimientoCompraLinea.cantReservada`. */
  porLinea: { id: number; descontar: number }[];
}

export interface FilaConsumo {
  materialId: number;
  teorico: number;
  entregado: number;
  /** entregado − teórico. Positivo = se gastó de más. */
  diferencia: number;
}

/** La escala del kardex es Decimal(14,4): todo se compara y se guarda a 4 decimales. */
const r4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Reparte una entrega de material contra las reservas vivas de la OP, en orden.
 *
 * Lo consumido deja de estar "amarrado" y pasa a estar gastado, así que hay que
 * bajarlo de la reserva **al mismo tiempo** que del stock. Si no, pasan dos cosas
 * feas: el neto disponible queda subestimado (se compra de más) y al cerrar el
 * pedido `liberarReservasDeOp` devuelve una reserva que ya no existía, dejando el
 * agregado en negativo.
 *
 * Consumir más de lo reservado es normal (el BOM se queda corto, o el material
 * nunca se amarró porque había que comprarlo): el excedente simplemente no toca
 * la reserva, sale del stock libre.
 */
export function repartirDescargaDeReserva(
  cantidad: number,
  lineas: LineaReservaMin[],
): DescargaDeReserva {
  const porLinea: { id: number; descontar: number }[] = [];
  let pendiente = Math.max(0, r4(cantidad));

  for (const l of lineas) {
    if (pendiente <= 0) break;
    const disponible = Math.max(0, l.cantReservada);
    if (disponible <= 0) continue;
    const descontar = r4(Math.min(pendiente, disponible));
    porLinea.push({ id: l.id, descontar });
    pendiente = r4(pendiente - descontar);
  }

  const total = r4(porLinea.reduce((acc, l) => acc + l.descontar, 0));
  return { total, porLinea };
}

/**
 * Cruza el consumo teórico (BOM × pares de la OF) contra lo realmente entregado.
 * Es la pantalla del almacenista y la base del costeo real por OF.
 *
 * Sale primero el BOM en su orden (es como el cliente lee su ficha) y al final
 * los materiales que se entregaron sin estar en el BOM, que son justo los que él
 * quiere ver: lo que se gastó sin estar previsto.
 */
export function consolidarConsumo(
  teorico: Map<number, number>,
  entregado: Map<number, number>,
): FilaConsumo[] {
  const fila = (materialId: number): FilaConsumo => {
    const t = r4(teorico.get(materialId) ?? 0);
    const e = r4(entregado.get(materialId) ?? 0);
    return { materialId, teorico: t, entregado: e, diferencia: r4(e - t) };
  };

  const out = [...teorico.keys()].map(fila);
  for (const materialId of entregado.keys()) {
    if (!teorico.has(materialId)) out.push(fila(materialId));
  }
  return out;
}
