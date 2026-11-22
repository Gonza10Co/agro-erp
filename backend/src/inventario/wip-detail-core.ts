import { ORDEN_CELULAS } from '../fabricacion/fabricacion-core';

/**
 * Detalle del inventario en proceso (pares EN_PROCESO) para el Excel de inventarios:
 * una fila por célula × OF × producto × talla × línea × calidad. Lógica pura, sin BD.
 */

export interface WipGroup {
  celulaActual: string;
  productoConfiguradoId: number;
  tallaId: number;
  lineaId: number | null;
  ofId: number;
  calidad: 'PRIMERA' | 'SEGUNDA';
  _count: { _all: number };
}

export interface WipCatalog {
  productos: Map<number, { codigo: string; nombre: string; referencia: string; marca: string }>;
  tallas: Map<number, number>;
  lineas: Map<number, string>;
  ofs: Map<number, number>;
}

export interface WipDetailRow {
  celula: string;
  of: number | null;
  linea: string | null;
  referencia: string;
  marca: string;
  producto: string;
  codigo: string;
  talla: number | null;
  calidad: 'PRIMERA' | 'SEGUNDA';
  pares: number;
}

export function buildWipDetailRows(groups: WipGroup[], cat: WipCatalog): WipDetailRow[] {
  const rows = groups.map((g) => {
    const p = cat.productos.get(g.productoConfiguradoId);
    return {
      celula: g.celulaActual,
      of: cat.ofs.get(g.ofId) ?? null,
      linea: g.lineaId == null ? null : cat.lineas.get(g.lineaId) ?? null,
      referencia: p?.referencia ?? '',
      marca: p?.marca ?? '',
      producto: p?.nombre ?? '',
      codigo: p?.codigo ?? '',
      talla: cat.tallas.get(g.tallaId) ?? null,
      calidad: g.calidad,
      pares: g._count._all,
    };
  });
  // Orden de flujo de planta; dentro de la célula por OF, código y talla.
  const rango = (c: string) => {
    const i = ORDEN_CELULAS.indexOf(c as (typeof ORDEN_CELULAS)[number]);
    return i < 0 ? ORDEN_CELULAS.length : i;
  };
  return rows.sort(
    (a, b) =>
      rango(a.celula) - rango(b.celula) ||
      (a.of ?? 0) - (b.of ?? 0) ||
      a.codigo.localeCompare(b.codigo) ||
      (a.talla ?? 0) - (b.talla ?? 0) ||
      a.calidad.localeCompare(b.calidad),
  );
}
