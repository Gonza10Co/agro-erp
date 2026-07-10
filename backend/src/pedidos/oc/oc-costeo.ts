// Costeo de una OC: costo de materiales por par (vía BOM) vs. precio de venta.
// Lógica pura, sin Prisma. Solo materiales (sin mano de obra) — Fase A.

export interface CompradoConsumo {
  materialId: number;
  consumo: number;
}

/** Costo de materiales de un par (para una talla): Σ(consumo_insumo × costo_insumo). */
export function costoParDesdeComprados(
  comprados: CompradoConsumo[],
  costoUnitario: (materialId: number) => number,
): number {
  return comprados.reduce((acc, c) => acc + c.consumo * costoUnitario(c.materialId), 0);
}

export interface ItemCosteo {
  cantidad: number; // pares de esa talla
  precioUnitario: number; // venta por par
  costoPar: number; // costo de materiales por par (de esa talla)
}

export interface ResumenCosteo {
  totalVenta: number;
  costoTotal: number;
  utilidad: number;
  margenPct: number; // 0..100
}

/** Agrega ventas y costos de todas las tallas/líneas de una OC. */
export function resumenCosteo(items: ItemCosteo[]): ResumenCosteo {
  let totalVenta = 0;
  let costoTotal = 0;
  for (const it of items) {
    totalVenta += it.cantidad * it.precioUnitario;
    costoTotal += it.cantidad * it.costoPar;
  }
  const utilidad = totalVenta - costoTotal;
  const margenPct = totalVenta > 0 ? (utilidad / totalVenta) * 100 : 0;
  return { totalVenta, costoTotal, utilidad, margenPct };
}
