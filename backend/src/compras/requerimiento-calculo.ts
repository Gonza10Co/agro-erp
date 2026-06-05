/** Línea persistible del requerimiento (lo que va a RequerimientoCompraLinea). */
export interface LineaRequerimientoData {
  materialId: number;
  proveedorId: number | null;
  cantNecesaria: number;
  cantDisponible: number;
  cantAComprar: number;
}

/** Línea enriquecida para la respuesta/UI (con nombres). */
export interface LineaSalida extends LineaRequerimientoData {
  materialCodigo: string;
  materialNombre: string;
  proveedorNombre: string | null;
}

export interface GrupoRequerimiento {
  proveedor: { id: number; nombre: string } | null;
  lineas: LineaSalida[];
}

/**
 * Cruza necesidad bruta contra stock y arma las líneas netas.
 * Preserva el orden de inserción de `bruto`. Descarta materiales con necesaria == 0.
 */
export function construirLineasRequerimiento(
  bruto: Map<number, number>,
  stock: Map<number, number>,
  proveedorPorMaterial: Map<number, number | null>,
): LineaRequerimientoData[] {
  const out: LineaRequerimientoData[] = [];
  for (const [materialId, cantNecesaria] of bruto) {
    if (cantNecesaria <= 0) continue;
    const cantDisponible = stock.get(materialId) ?? 0;
    out.push({
      materialId,
      proveedorId: proveedorPorMaterial.get(materialId) ?? null,
      cantNecesaria,
      cantDisponible,
      cantAComprar: Math.max(0, cantNecesaria - cantDisponible),
    });
  }
  return out;
}

/**
 * Agrupa líneas de salida por proveedor, preservando el orden de primera aparición.
 * Las líneas sin proveedor (proveedorId == null) van a un grupo final.
 */
export function agruparPorProveedor(lineas: LineaSalida[]): GrupoRequerimiento[] {
  const conProv = new Map<number, GrupoRequerimiento>();
  const sinProv: LineaSalida[] = [];

  for (const l of lineas) {
    if (l.proveedorId == null) {
      sinProv.push(l);
      continue;
    }
    let g = conProv.get(l.proveedorId);
    if (!g) {
      g = { proveedor: { id: l.proveedorId, nombre: l.proveedorNombre ?? '' }, lineas: [] };
      conProv.set(l.proveedorId, g);
    }
    g.lineas.push(l);
  }

  const grupos = [...conProv.values()];
  if (sinProv.length) grupos.push({ proveedor: null, lineas: sinProv });
  return grupos;
}
