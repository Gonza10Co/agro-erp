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

/** Grado del producto terminado: las segundas son un saldo aparte, no un SKU. */
export type CalidadPT = 'PRIMERA' | 'SEGUNDA';

export interface PtStock {
  producto: string;
  codigo: string;
  talla: number;
  bodega: string;
  calidad: CalidadPT;
  cantDisponible: number;
  cantReservada: number;
}

export interface InventarioConsolidado {
  materiales: MaterialStock[];
  wip: WipCelula[];
  pt: PtStock[];
}

/** Registro escalar de Bodega devuelto por POST /inventario/bodegas. */
export interface Bodega {
  id: number;
  codigo: string;
  nombre: string;
  tipo: string;
  prioridad: number;
  activo: boolean;
}

/** Registro escalar de InventarioPT devuelto por POST /inventario/pt. */
export interface InventarioPTRow {
  id: number;
  productoConfiguradoId: number;
  tallaId: number;
  bodegaId: number;
  cantDisponible: number;
  cantReservada: number;
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

/** Fila de la plantilla de conteo físico de producto terminado. */
export interface FilaPlantillaPt {
  referencia: string;
  marca: string;
  producto: string;
  codigo: string;
  talla: number;
  bodega: string;
  calidad: CalidadPT;
  disponible: number;
  reservado: number;
}

/** Fila del conteo que se envía al backend (solo las que traen conteo). */
export interface FilaAjustePt {
  fila: number;
  codigo: string;
  talla: number;
  bodega: string;
  calidad: string;
  conteo: number;
}

export interface FilaAjustePtRevisada extends FilaAjustePt {
  producto: string | null;
  actual: number;
  reservado: number;
  diferencia: number;
  error: string | null;
}

export interface ResumenAjustePt {
  filas: number;
  errores: number;
  sinCambio: number;
  suben: number;
  bajan: number;
  paresEntran: number;
  paresSalen: number;
}

/** Quién puede fijar saldos de producto terminado (el backend lo exige igual). */
export const ROLES_AJUSTE_PT = ['GERENTE', 'ADMIN'];
