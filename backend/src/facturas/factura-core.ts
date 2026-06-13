// Núcleo puro de facturación: valoriza lo despachado y calcula totales.
// Sin Prisma ni Nest — testeable en aislamiento. Redondeo a 2 decimales (centavos).

export interface LineaDespachoParaFacturar {
  productoConfiguradoId: number;
  tallaId: number;
  cantidad: number;
}

export interface LineaFacturaData {
  productoConfiguradoId: number;
  tallaId: number;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
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
 * pactado del producto. Lanza si algún producto despachado no tiene precio pactado.
 */
export function lineasDeFactura(
  lineasDespacho: LineaDespachoParaFacturar[],
  precioPorProducto: Map<number, number>,
): LineaFacturaData[] {
  return lineasDespacho.map((l) => {
    const precio = precioPorProducto.get(l.productoConfiguradoId);
    if (precio == null)
      throw new Error(
        `Producto ${l.productoConfiguradoId} sin precio pactado en la OC`,
      );
    return {
      productoConfiguradoId: l.productoConfiguradoId,
      tallaId: l.tallaId,
      cantidad: l.cantidad,
      precioUnitario: precio,
      subtotal: redondear(l.cantidad * precio),
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
