// Núcleo puro de la Demo 13 — compras lado proveedor.
// Sin Prisma ni NestJS: todo testeable en memoria.

export type EstadoOcp = 'PENDIENTE' | 'PARCIAL' | 'COMPLETA' | 'ANULADA';

export interface LineaOcpCantidades {
  cantPedida: number;
  cantRecibida: number;
}

export interface LineaOcpConId extends LineaOcpCantidades {
  id: number;
}

export interface LineaRecepcionDto {
  ocpLineaId: number;
  cantidad: number;
}

export interface LineaDevolucionDto {
  materialId: number;
  cantidad: number;
}

// El estado de la OCP se deriva siempre de sus líneas; nunca se persiste a mano.
export function estadoOcp(lineas: LineaOcpCantidades[]): EstadoOcp {
  if (!lineas.length) return 'PENDIENTE';
  const completas = lineas.filter((l) => l.cantRecibida >= l.cantPedida).length;
  const algoRecibido = lineas.some((l) => l.cantRecibida > 0);
  if (completas === lineas.length) return 'COMPLETA';
  return algoRecibido ? 'PARCIAL' : 'PENDIENTE';
}

export function validarRecepcion(
  lineasOcp: LineaOcpConId[],
  lineas: LineaRecepcionDto[],
): string | null {
  if (!lineas.length) return 'La recepción debe tener al menos una línea';
  const porId = new Map(lineasOcp.map((l) => [l.id, l]));
  const vistas = new Set<number>();
  for (const l of lineas) {
    if (vistas.has(l.ocpLineaId)) return `Línea ${l.ocpLineaId} repetida en la recepción`;
    vistas.add(l.ocpLineaId);
    if (l.cantidad <= 0) return 'Cada cantidad recibida debe ser mayor a 0';
    const ocpLinea = porId.get(l.ocpLineaId);
    if (!ocpLinea) return `La línea ${l.ocpLineaId} no pertenece a esta orden de compra`;
    const pendiente = ocpLinea.cantPedida - ocpLinea.cantRecibida;
    if (l.cantidad > pendiente)
      return `La cantidad recibida (${l.cantidad}) supera lo pendiente (${pendiente}) de la línea ${l.ocpLineaId}`;
  }
  return null;
}

/**
 * Costo promedio móvil (weighted average) tras una entrada valorizada de inventario.
 *   nuevoPromedio = (stockPrevio·costoPrevio + cantEntra·costoEntra) / (stockPrevio + cantEntra)
 * Si no había stock, el promedio es simplemente el costo de la entrada.
 */
export function costoPromedioMovil(
  stockPrevio: number,
  costoPrevio: number,
  cantEntra: number,
  costoEntra: number,
): number {
  const stockNuevo = stockPrevio + cantEntra;
  if (stockNuevo <= 0) return costoEntra;
  return (stockPrevio * costoPrevio + cantEntra * costoEntra) / stockNuevo;
}

export interface LineaOcpManual {
  materialId: number;
  cantPedida: number;
  costoUnitario?: number | null;
}

// Validación de la OCP manual (compra directa, sin requerimiento: reposición de
// stock, insumos no ligados a una OP).
export function validarOcpManual(lineas: LineaOcpManual[]): string | null {
  if (!lineas.length) return 'La orden debe tener al menos una línea';
  const vistos = new Set<number>();
  for (const l of lineas) {
    if (vistos.has(l.materialId)) return `Material ${l.materialId} repetido en la orden`;
    vistos.add(l.materialId);
    if (l.cantPedida <= 0) return 'Cada cantidad pedida debe ser mayor a 0';
    if (l.costoUnitario != null && l.costoUnitario <= 0)
      return 'El costo unitario, si se captura, debe ser mayor a 0';
  }
  return null;
}

// Guarda de anulación: solo una OCP sin mercancía movida puede anularse.
export function validarAnulacionOcp(ocp: {
  estado: EstadoOcp;
  recepciones: number;
  devoluciones: number;
}): string | null {
  if (ocp.estado === 'ANULADA') return 'La orden ya está anulada';
  if (ocp.recepciones > 0)
    return 'La orden tiene recepciones registradas; ya no se puede anular';
  if (ocp.devoluciones > 0)
    return 'La orden tiene devoluciones registradas; ya no se puede anular';
  return null;
}

export function validarDevolucion(
  causa: string,
  lineas: LineaDevolucionDto[],
): string | null {
  if (!causa || !causa.trim()) return 'La causa de la devolución es obligatoria';
  if (!lineas.length) return 'La devolución debe tener al menos una línea';
  const vistos = new Set<number>();
  for (const l of lineas) {
    if (vistos.has(l.materialId)) return `Material ${l.materialId} repetido en la devolución`;
    vistos.add(l.materialId);
    if (l.cantidad <= 0) return 'Cada cantidad devuelta debe ser mayor a 0';
  }
  return null;
}
