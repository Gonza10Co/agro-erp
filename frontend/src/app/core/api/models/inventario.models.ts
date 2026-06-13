import { Celula } from './fabricacion.models';

export interface MaterialStock {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  cantDisponible: number;
}

export interface WipCelula {
  celula: Celula;
  pares: number;
}

export interface PtStock {
  producto: string;
  codigo: string;
  talla: number;
  bodega: string;
  cantDisponible: number;
  cantReservada: number;
}

export interface InventarioConsolidado {
  materiales: MaterialStock[];
  wip: WipCelula[];
  pt: PtStock[];
}

export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE';
export type MotivoMovimiento =
  | 'PRODUCCION'
  | 'DESPACHO'
  | 'COMPRA'
  | 'CONSUMO_PRODUCCION'
  | 'DEVOLUCION_CLIENTE'
  | 'DEVOLUCION_PROVEEDOR'
  | 'AJUSTE_MANUAL';

export interface MovimientoKardex {
  id: number;
  tipo: TipoMovimiento;
  motivo: MotivoMovimiento;
  cantidad: string | number; // Decimal serializado
  referencia: string | null;
  observaciones: string | null;
  createdAt: string;
  material: {
    codigo: string;
    nombreCanonico: string;
    unidadMedida: { codigo: string };
  } | null;
  inventarioPT: {
    productoConfigurado: { codigo: string; nombreComercial: string };
    talla: { valor: number };
    bodega: { nombre: string };
  } | null;
  usuario: { username: string } | null;
}

export interface MovimientoMaterialInput {
  materialId: number;
  tipo: 'ENTRADA' | 'SALIDA';
  motivo: MotivoMovimiento;
  cantidad: number;
  referencia?: string;
  observaciones?: string;
}

export const LABEL_MOTIVO: Record<MotivoMovimiento, string> = {
  PRODUCCION: 'Producción',
  DESPACHO: 'Despacho',
  COMPRA: 'Compra',
  CONSUMO_PRODUCCION: 'Consumo de producción',
  DEVOLUCION_CLIENTE: 'Devolución de cliente',
  DEVOLUCION_PROVEEDOR: 'Devolución a proveedor',
  AJUSTE_MANUAL: 'Ajuste manual',
};

// Motivos manuales válidos por tipo (espejo de la validación del backend).
export const MOTIVOS_MANUALES: Record<'ENTRADA' | 'SALIDA', MotivoMovimiento[]> = {
  ENTRADA: ['COMPRA', 'AJUSTE_MANUAL'],
  SALIDA: ['CONSUMO_PRODUCCION', 'DEVOLUCION_PROVEEDOR', 'AJUSTE_MANUAL'],
};
