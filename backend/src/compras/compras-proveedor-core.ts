// Núcleo puro de la Demo 13 — compras lado proveedor.
// Sin Prisma ni NestJS: todo testeable en memoria.

export type EstadoOcp = 'PENDIENTE' | 'PARCIAL' | 'COMPLETA';

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
