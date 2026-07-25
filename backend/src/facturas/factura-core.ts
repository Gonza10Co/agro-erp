// Núcleo puro de facturación: valoriza lo despachado y calcula totales.
// Sin Prisma ni Nest — testeable en aislamiento. Redondeo a 2 decimales (centavos).

export type CalidadPT = 'PRIMERA' | 'SEGUNDA';

export interface LineaDespachoParaFacturar {
  productoConfiguradoId: number;
  tallaId: number;
  calidad?: CalidadPT;
  cantidad: number;
}

export interface LineaFacturaData {
  productoConfiguradoId: number;
  tallaId: number;
  calidad: CalidadPT;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** Clave del precio pactado: el mismo producto vale distinto según su grado. */
export function clavePrecio(productoConfiguradoId: number, calidad: CalidadPT): string {
  return `${productoConfiguradoId}|${calidad}`;
}

export interface Totales {
  subtotal: number;
  iva: number;
  total: number;
}

/** Redondea a 2 decimales evitando el drift de coma flotante. */
function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Construye las líneas de factura valorizando cada línea de despacho con el precio
 * pactado para su producto Y SU GRADO: una segunda se vende más barata, así que el
 * precio se busca por (producto, calidad). Lanza si no hay precio pactado.
 */
export function lineasDeFactura(
  lineasDespacho: LineaDespachoParaFacturar[],
  precioPorProducto: Map<string, number>,
): LineaFacturaData[] {
  return lineasDespacho.map((l) => {
    const calidad = l.calidad ?? 'PRIMERA';
    const precio = precioPorProducto.get(clavePrecio(l.productoConfiguradoId, calidad));
    if (precio == null)
      throw new Error(
        `Producto ${l.productoConfiguradoId} (${calidad}) sin precio pactado en la OC`,
      );
    return {
      productoConfiguradoId: l.productoConfiguradoId,
      tallaId: l.tallaId,
      calidad,
      cantidad: l.cantidad,
      precioUnitario: precio,
      subtotal: redondear(l.cantidad * precio),
    };
  });
}

export interface LineaServicioEntrada {
  servicioId?: number | null;
  descripcion?: string | null;
  cantidad: number;
  precioUnitario: number;
}

export interface LineaServicioData {
  servicioId: number | null;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/**
 * Líneas de una factura de SERVICIO (maquila, mantenimiento). A diferencia de las
 * de producto no hay precio pactado en una OC: el precio viene en la línea, porque
 * el servicio se negocia por tarifa. Cada línea debe poder nombrarse: sin servicio
 * del catálogo ni descripción, la factura saldría con un renglón mudo.
 */
export function lineasDeServicio(
  lineas: LineaServicioEntrada[],
): LineaServicioData[] {
  return lineas.map((l, i) => {
    if (l.servicioId == null && !l.descripcion?.trim())
      throw new Error(`La línea ${i + 1} necesita un servicio o una descripción`);
    if (l.cantidad <= 0) throw new Error(`La línea ${i + 1} debe tener cantidad mayor a 0`);
    if (l.precioUnitario < 0)
      throw new Error(`La línea ${i + 1} no puede tener precio negativo`);
    return {
      servicioId: l.servicioId ?? null,
      descripcion: l.descripcion?.trim() || null,
      cantidad: l.cantidad,
      precioUnitario: l.precioUnitario,
      subtotal: redondear(l.cantidad * l.precioUnitario),
    };
  });
}

/** Suma los subtotales y aplica el IVA (porcentaje). */
export function totales(lineas: { subtotal: number }[], ivaPct: number): Totales {
  const subtotal = redondear(lineas.reduce((s, l) => s + l.subtotal, 0));
  const iva = redondear((subtotal * ivaPct) / 100);
  const total = redondear(subtotal + iva);
  return { subtotal, iva, total };
}
