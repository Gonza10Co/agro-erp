export interface ReservaPlana {
  productoConfiguradoId: number;
  tallaId: number;
  bodegaId: number;
  cantidad: number;
}

export type LineaDespachoData = ReservaPlana;

/** Agrupa reservas por (producto, talla, bodega) sumando cantidades. Preserva el orden de primera aparición. */
export function construirLineasDespacho(reservas: ReservaPlana[]): LineaDespachoData[] {
  const map = new Map<string, LineaDespachoData>();
  for (const r of reservas) {
    const key = `${r.productoConfiguradoId}|${r.tallaId}|${r.bodegaId}`;
    const ex = map.get(key);
    if (ex) ex.cantidad += r.cantidad;
    else map.set(key, { productoConfiguradoId: r.productoConfiguradoId, tallaId: r.tallaId, bodegaId: r.bodegaId, cantidad: r.cantidad });
  }
  return [...map.values()];
}
