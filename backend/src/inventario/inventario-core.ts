import { MotivoMovimiento, TipoMovimiento } from '@prisma/client';

export interface MovimientoMaterialInput {
  tipo: TipoMovimiento;
  motivo: MotivoMovimiento;
  cantidad: number;
}

// Motivos que solo escribe el sistema (hooks de producción y despacho).
const MOTIVOS_SISTEMA: MotivoMovimiento[] = ['PRODUCCION', 'DESPACHO'];

// Combinaciones tipo→motivo válidas para movimientos manuales de materia prima.
const MOTIVOS_POR_TIPO: Record<string, MotivoMovimiento[]> = {
  ENTRADA: ['COMPRA', 'AJUSTE_MANUAL'],
  SALIDA: ['CONSUMO_PRODUCCION', 'DEVOLUCION_PROVEEDOR', 'AJUSTE_MANUAL'],
};

/**
 * Valida un movimiento manual de materia prima.
 * Devuelve el mensaje de error, o null si es válido.
 */
export function validarMovimientoMaterial(input: MovimientoMaterialInput): string | null {
  if (!(input.cantidad > 0)) return 'La cantidad debe ser mayor que cero';
  if (MOTIVOS_SISTEMA.includes(input.motivo))
    return `El motivo ${input.motivo} es del sistema; no se registra manualmente`;
  if (input.motivo === 'DEVOLUCION_CLIENTE')
    return 'DEVOLUCION_CLIENTE aplica a producto terminado, no a materia prima';
  const permitidos = MOTIVOS_POR_TIPO[input.tipo] ?? [];
  if (!permitidos.includes(input.motivo))
    return `El motivo ${input.motivo} no corresponde a un movimiento de ${input.tipo}`;
  return null;
}
