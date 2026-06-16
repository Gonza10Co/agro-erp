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
  valor: number;
}

export type AcumuladoReporte = Omit<FilaDiaReporte, 'fecha'>;

export interface Cumplimiento {
  meta: number;
  real: number;
  pct: number;
}

export interface BloqueMetas {
  guarnicion: Cumplimiento;
  inyeccion: Cumplimiento;
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
}

export type TipoMeta = 'GUARNICION' | 'INYECCION' | 'FACTURACION_PARES' | 'FACTURACION_VALOR';

export interface MetaItem {
  tipo: TipoMeta;
  valor: number;
}
