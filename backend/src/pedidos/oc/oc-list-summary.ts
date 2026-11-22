/**
 * Resumen liviano de las líneas de una OC para la lista de pedidos: cuántos pares
 * pide y qué marcas y referencias trae. Con esto la lista filtra por marca/referencia
 * y suma pares en el front sin bajar las tallas de cada pedido.
 */

export interface OrderListSummary {
  pairs: number;
  brands: { id: number; nombre: string }[];
  references: { id: number; codigo: string }[];
}

export interface LineaParaResumen {
  productoConfigurado?: {
    marca?: { id: number; nombre: string } | null;
    referencia?: { id: number; codigo: string } | null;
  } | null;
  tallas?: { cantidad: number }[];
}

export function orderListSummary(lineas: LineaParaResumen[] | null | undefined): OrderListSummary {
  const brands = new Map<number, { id: number; nombre: string }>();
  const references = new Map<number, { id: number; codigo: string }>();
  let pairs = 0;
  for (const l of lineas ?? []) {
    for (const t of l.tallas ?? []) pairs += t.cantidad;
    const m = l.productoConfigurado?.marca;
    const r = l.productoConfigurado?.referencia;
    if (m) brands.set(m.id, { id: m.id, nombre: m.nombre });
    if (r) references.set(r.id, { id: r.id, codigo: r.codigo });
  }
  return {
    pairs,
    brands: [...brands.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    references: [...references.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)),
  };
}

/** Lo que el include de Prisma necesita para armar el resumen (sin N+1). */
export const ORDER_LIST_SUMMARY_SELECT = {
  select: {
    productoConfigurado: {
      select: {
        marca: { select: { id: true, nombre: true } },
        referencia: { select: { id: true, codigo: true } },
      },
    },
    tallas: { select: { cantidad: true } },
  },
} as const;
