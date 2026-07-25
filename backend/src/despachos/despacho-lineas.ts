export type CalidadPT = 'PRIMERA' | 'SEGUNDA';

export interface ReservaPlana {
  productoConfiguradoId: number;
  tallaId: number;
  bodegaId: number;
  calidad?: CalidadPT;
  cantidad: number;
}

export type LineaDespachoData = ReservaPlana & { calidad: CalidadPT };

/**
 * Agrupa reservas por (producto, talla, bodega, CALIDAD) sumando cantidades.
 * Preserva el orden de primera aparición. La calidad entra en la clave porque
 * una primera y una segunda del mismo producto/talla/bodega son mercancía
 * distinta: colapsarlas dejaría un remito que no dice qué se está entregando.
 */
export function construirLineasDespacho(reservas: ReservaPlana[]): LineaDespachoData[] {
  const map = new Map<string, LineaDespachoData>();
  for (const r of reservas) {
    const calidad = r.calidad ?? 'PRIMERA';
    const key = `${r.productoConfiguradoId}|${r.tallaId}|${r.bodegaId}|${calidad}`;
    const ex = map.get(key);
    if (ex) ex.cantidad += r.cantidad;
    else
      map.set(key, {
        productoConfiguradoId: r.productoConfiguradoId,
        tallaId: r.tallaId,
        bodegaId: r.bodegaId,
        calidad,
        cantidad: r.cantidad,
      });
  }
  return [...map.values()];
}
