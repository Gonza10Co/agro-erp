// Espejo del contrato del backend (reportes/reporte-diario-core.ts).

export interface FilaDiaReporte {
  fecha: string; // YYYY-MM-DD
  troquelado: number;
  guarnicion: number;
  almacen: number;
  externo: number;
  inyeccion: number;
  bodega: number;
  segundas: number;
  paresVendidos: number;
  valor: number; // facturación de producto
  servicios: number; // facturación de maquila/mantenimiento (línea de ingreso aparte)
}

export type AcumuladoReporte = Omit<FilaDiaReporte, 'fecha'>;

export interface Cumplimiento {
  meta: number;
  real: number;
  pct: number;
}

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';

export interface CumplimientoCelula extends Cumplimiento {
  celula: Celula;
}

export interface BloqueMetas {
  /** Siempre las 5 células, en orden de flujo, tengan meta o no. */
  celulas: CumplimientoCelula[];
  facturacionPares: Cumplimiento;
  facturacionValor: Cumplimiento;
}

export interface FilaKardexPT {
  fecha: string;
  saldoInicial: number;
  ingreso: number;
  venta: number;
  devolucion: number;
  saldoFinal: number;
}

export interface ReporteDiario {
  anio: number;
  mes: number;
  filas: FilaDiaReporte[];
  acumulado: AcumuladoReporte;
  metas: BloqueMetas;
  kardexPT: FilaKardexPT[];
  pendientes: string[];
  /** Línea filtrada (null = toda la fábrica). El kardex PT se corta por la línea
   *  sellada en cada movimiento; los históricos sin línea suman solo en el global. */
  lineaId?: number | null;
}

/** El tipo de meta ES la célula, más las dos de facturación (espejo del backend). */
export type TipoMeta = Celula | 'FACTURACION_PARES' | 'FACTURACION_VALOR';

/** Orden de la pantalla: flujo de planta y al final la facturación. */
export const TIPOS_META: readonly TipoMeta[] = [
  'CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT',
  'FACTURACION_PARES', 'FACTURACION_VALOR',
];

/** Etiquetas de las metas tal como las nombra el dueño en su Excel. */
export const ETIQUETA_META: Record<TipoMeta, string> = {
  CORTE: 'Corte',
  GUARNICION: 'Guarnición',
  ALMACEN: 'Almacén',
  INYECCION: 'Inyección',
  PT: 'P. Terminado',
  FACTURACION_PARES: 'Facturación (pares)',
  FACTURACION_VALOR: 'Facturación ($)',
};

export interface MetaItem {
  tipo: TipoMeta;
  valor: number;
}
