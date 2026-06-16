// Núcleo puro del reporte diario gerencial. Sin Prisma ni Nest: todo testeable.
// Replica el Excel maestro que el dueño revisa (producción por célula/día,
// acumulado, metas con % de cumplimiento y kardex de Producto Terminado).

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';
export type TipoMeta = 'GUARNICION' | 'INYECCION' | 'FACTURACION_PARES' | 'FACTURACION_VALOR';

/** Columnas de producción de la fila diaria que se alimentan de eventos de célula. */
export type ColumnaProduccion = 'troquelado' | 'guarnicion' | 'almacen' | 'inyeccion' | 'bodega';

/** Conceptos que el Excel muestra pero que aún NO se capturan en el backend. */
export const COLUMNAS_PENDIENTES = ['EXTERNO', 'SEGUNDAS', 'SERVICIOS_MANTENIMIENTO'] as const;

const CELULA_A_COLUMNA: Record<Celula, ColumnaProduccion> = {
  CORTE: 'troquelado',
  GUARNICION: 'guarnicion',
  ALMACEN: 'almacen',
  INYECCION: 'inyeccion',
  PT: 'bodega',
};

export interface EventoMin {
  celula: Celula;
  subPaso?: string | null; // poblado solo en eventos de Guarnición
  timestamp: Date;
}
export interface VentaMin {
  fecha: Date;
  pares: number;
  valor: number;
}
export interface MetaMin {
  tipo: TipoMeta;
  valor: number;
}
export interface MovPTMin {
  tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
  motivo: string;
  cantidad: number;
  createdAt: Date;
}

export interface InputReporte {
  anio: number;
  mes: number; // 1..12
  eventos: EventoMin[];
  ventas: VentaMin[];
  metas: MetaMin[];
  saldoInicialPT: number;
  movimientosPT: MovPTMin[];
}

export interface FilaDia {
  fecha: string; // YYYY-MM-DD
  troquelado: number;
  guarnicion: number;
  almacen: number;
  externo: number; // pendiente de captura → 0
  inyeccion: number;
  bodega: number;
  segundas: number; // pendiente de captura → 0
  paresVendidos: number;
  valor: number;
}

export type Acumulado = Omit<FilaDia, 'fecha'>;

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
  ingreso: number; // ENTRADA / PRODUCCION
  venta: number; // SALIDA / DESPACHO
  devolucion: number; // ENTRADA / DEVOLUCION_CLIENTE
  saldoFinal: number;
}

export interface ReporteDiario {
  anio: number;
  mes: number;
  filas: FilaDia[];
  acumulado: Acumulado;
  metas: BloqueMetas;
  kardexPT: FilaKardexPT[];
  pendientes: readonly string[];
}

/** Fecha → 'YYYY-MM-DD' en UTC. */
export function claveDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function columnaDeCelula(celula: Celula): ColumnaProduccion {
  return CELULA_A_COLUMNA[celula];
}

/** % de cumplimiento = real/meta*100 a 1 decimal. Meta ≤ 0 → 0 (sin meta no hay %). */
export function pctCumplimiento(real: number, meta: number): number {
  if (meta <= 0) return 0;
  return Math.round((real / meta) * 1000) / 10;
}

function filaVacia(fecha: string): FilaDia {
  return {
    fecha,
    troquelado: 0,
    guarnicion: 0,
    almacen: 0,
    externo: 0,
    inyeccion: 0,
    bodega: 0,
    segundas: 0,
    paresVendidos: 0,
    valor: 0,
  };
}

/** Lista de claves 'YYYY-MM-DD' de todos los días del mes (en orden). */
function diasDelMes(anio: number, mes: number): string[] {
  const dias: string[] = [];
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate(); // mes en base-1: día 0 del siguiente
  for (let d = 1; d <= ultimo; d++) {
    dias.push(`${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dias;
}

export function construirReporte(input: InputReporte): ReporteDiario {
  const { anio, mes } = input;
  const porDia = new Map<string, FilaDia>();
  for (const fecha of diasDelMes(anio, mes)) porDia.set(fecha, filaVacia(fecha));

  // Producción: cada evento suma 1 par en la columna de su célula.
  // En Guarnición un par genera un evento por sub-paso; la "producción" de la célula
  // es la salida real (sub-paso AMARRE, cuando la capellada pasa al Almacén), así que
  // los sub-pasos intermedios no cuentan para evitar sobreconteo.
  for (const ev of input.eventos) {
    if (ev.celula === 'GUARNICION' && ev.subPaso !== 'AMARRE') continue;
    const fila = porDia.get(claveDia(ev.timestamp));
    if (!fila) continue;
    fila[columnaDeCelula(ev.celula)] += 1;
  }

  // Ventas: pares vendidos y valor por día.
  for (const v of input.ventas) {
    const fila = porDia.get(claveDia(v.fecha));
    if (!fila) continue;
    fila.paresVendidos += v.pares;
    fila.valor += v.valor;
  }

  const filas = [...porDia.values()];

  // Acumulado del mes.
  const acumulado: Acumulado = {
    troquelado: 0,
    guarnicion: 0,
    almacen: 0,
    externo: 0,
    inyeccion: 0,
    bodega: 0,
    segundas: 0,
    paresVendidos: 0,
    valor: 0,
  };
  for (const f of filas) {
    acumulado.troquelado += f.troquelado;
    acumulado.guarnicion += f.guarnicion;
    acumulado.almacen += f.almacen;
    acumulado.inyeccion += f.inyeccion;
    acumulado.bodega += f.bodega;
    acumulado.paresVendidos += f.paresVendidos;
    acumulado.valor += f.valor;
  }

  // Metas: real vs objetivo del mes.
  const metaDe = (tipo: TipoMeta) => input.metas.find((m) => m.tipo === tipo)?.valor ?? 0;
  const cumplimiento = (real: number, tipo: TipoMeta): Cumplimiento => {
    const meta = metaDe(tipo);
    return { meta, real, pct: pctCumplimiento(real, meta) };
  };
  const metas: BloqueMetas = {
    guarnicion: cumplimiento(acumulado.guarnicion, 'GUARNICION'),
    inyeccion: cumplimiento(acumulado.inyeccion, 'INYECCION'),
    facturacionPares: cumplimiento(acumulado.paresVendidos, 'FACTURACION_PARES'),
    facturacionValor: cumplimiento(acumulado.valor, 'FACTURACION_VALOR'),
  };

  // Kardex de PT: arrastra el saldo día a día.
  const kardexPT: FilaKardexPT[] = [];
  let saldo = input.saldoInicialPT;
  for (const fecha of diasDelMes(anio, mes)) {
    let ingreso = 0;
    let venta = 0;
    let devolucion = 0;
    for (const m of input.movimientosPT) {
      if (claveDia(m.createdAt) !== fecha) continue;
      if (m.tipo === 'ENTRADA' && m.motivo === 'PRODUCCION') ingreso += m.cantidad;
      else if (m.tipo === 'SALIDA' && m.motivo === 'DESPACHO') venta += m.cantidad;
      else if (m.tipo === 'ENTRADA' && m.motivo === 'DEVOLUCION_CLIENTE') devolucion += m.cantidad;
    }
    const saldoInicial = saldo;
    const saldoFinal = saldoInicial + ingreso + devolucion - venta;
    kardexPT.push({ fecha, saldoInicial, ingreso, venta, devolucion, saldoFinal });
    saldo = saldoFinal;
  }

  return {
    anio,
    mes,
    filas,
    acumulado,
    metas,
    kardexPT,
    pendientes: COLUMNAS_PENDIENTES,
  };
}
