import {
  CalendarioMin,
  diasHabilesDelMes,
  esHabil as esDiaHabil,
  metaDiaria,
  metaEsperadaALaFecha,
} from './calendario-habil';

// Núcleo puro del reporte diario gerencial. Sin Prisma ni Nest: todo testeable.
// Replica el Excel maestro que el dueño revisa (producción por célula/día,
// acumulado, metas con % de cumplimiento y kardex de Producto Terminado).

export type Celula = 'CORTE' | 'GUARNICION' | 'ALMACEN' | 'INYECCION' | 'PT';

/** Las 5 células en el orden del flujo de planta. Manda el orden de la pantalla. */
export const CELULAS: readonly Celula[] = ['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT'];

/**
 * Una meta es por célula (el nombre del tipo ES la célula) o de facturación.
 * El dueño las lleva así en su Excel: una fila de objetivo por cada centro de costo.
 */
export type TipoMeta = Celula | 'FACTURACION_PARES' | 'FACTURACION_VALOR';

/** Todos los tipos de meta editables, en el orden en que se muestran. */
export const TIPOS_META: readonly TipoMeta[] = [
  ...CELULAS,
  'FACTURACION_PARES',
  'FACTURACION_VALOR',
];

/** Columnas de producción de la fila diaria que se alimentan de eventos de célula. */
export type ColumnaProduccion = 'troquelado' | 'guarnicion' | 'almacen' | 'inyeccion' | 'bodega';

/** Conceptos que el Excel muestra pero que aún NO se capturan en el backend. */
export const COLUMNAS_PENDIENTES = ['EXTERNO'] as const;

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
  subPasoInyeccion?: string | null; // ídem en los de Inyección
  timestamp: Date;
  esSegunda?: boolean; // el par viene marcado con grado SEGUNDA
}
export interface VentaMin {
  fecha: Date;
  pares: number;
  valor: number;
  esServicio?: boolean; // maquila/mantenimiento: factura plata, no vende pares
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
  /** Días que la planta trabaja. Sin él la meta se mide contra el mes entero (como antes). */
  calendario?: CalendarioMin;
  /** Corte para el "esperado a la fecha". Sin él se toma el mes completo. */
  hoy?: Date;
}

export interface FilaDia {
  fecha: string; // YYYY-MM-DD
  esHabil: boolean; // false = domingo o festivo: no se le exige meta
  troquelado: number;
  guarnicion: number;
  almacen: number;
  externo: number; // pendiente de captura → 0
  inyeccion: number;
  bodega: number; // pares de PRIMERA que entraron a bodega
  segundas: number; // pares de SEGUNDA que entraron a bodega (excluyentes con bodega)
  paresVendidos: number;
  valor: number; // facturación de PRODUCTO (lo que compara contra la meta comercial)
  servicios: number; // facturación de SERVICIO/maquila: línea de ingreso aparte
}

export type Acumulado = Omit<FilaDia, 'fecha' | 'esHabil'>;

export interface Cumplimiento {
  meta: number;
  real: number;
  pct: number;
  /** Meta prorrateada a los días hábiles ya transcurridos. */
  esperado: number;
  /** real vs esperado: el número que de verdad dice si se va al día o atrasado. */
  pctEsperado: number;
  /** Ritmo que exige la meta del mes. */
  diaria: number;
}
export interface CumplimientoCelula extends Cumplimiento {
  celula: Celula;
}
export interface BloqueMetas {
  /** Una entrada por célula, siempre las 5 y en orden de flujo (aunque no tengan meta). */
  celulas: CumplimientoCelula[];
  facturacionPares: Cumplimiento;
  facturacionValor: Cumplimiento;
  /** Días hábiles del mes y cuántos van corridos: el divisor de todo lo de arriba. */
  habiles: { transcurridos: number; total: number };
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

function filaVacia(fecha: string, esHabil = true): FilaDia {
  return {
    fecha,
    esHabil,
    troquelado: 0,
    guarnicion: 0,
    almacen: 0,
    externo: 0,
    inyeccion: 0,
    bodega: 0,
    segundas: 0,
    paresVendidos: 0,
    valor: 0,
    servicios: 0,
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
  const { anio, mes, calendario } = input;

  // Días hábiles: el divisor de la meta. Sin calendario configurado se cae al
  // comportamiento viejo (la meta se mide contra el mes entero), para no cambiarle
  // el número al cliente por el solo hecho de desplegar.
  const habilesDelMes = calendario ? diasHabilesDelMes(anio, mes, calendario) : [];
  const corte = input.hoy ? claveDia(input.hoy) : null;
  const habilesTranscurridos = corte
    ? habilesDelMes.filter((d) => d <= corte).length
    : habilesDelMes.length;

  const porDia = new Map<string, FilaDia>();
  for (const fecha of diasDelMes(anio, mes))
    porDia.set(fecha, filaVacia(fecha, calendario ? esDiaHabil(fecha, calendario) : true));

  // Producción: cada evento suma 1 par en la columna de su célula.
  // En Guarnición un par genera un evento por sub-paso; la "producción" de la célula
  // es la salida real (sub-paso AMARRE, cuando la capellada pasa al Almacén), así que
  // los sub-pasos intermedios no cuentan para evitar sobreconteo.
  // Inyección funciona igual desde que se modelaron sus sub-pasos (montaje →
  // inyección → finizaje → impacto): cuenta el último. Los eventos anteriores al
  // cambio no traen sub-paso y siguen contando como el escaneo único que fueron —
  // si se descartaran, la producción de inyección de meses ya mostrados al cliente
  // se caería a cero.
  for (const ev of input.eventos) {
    if (ev.celula === 'GUARNICION' && ev.subPaso !== 'AMARRE') continue;
    if (
      ev.celula === 'INYECCION' &&
      ev.subPasoInyeccion != null &&
      ev.subPasoInyeccion !== 'IMPACTO'
    )
      continue;
    const fila = porDia.get(claveDia(ev.timestamp));
    if (!fila) continue;
    // Al llegar a PT el grado separa las columnas: Bodega es producto de primera
    // y Segundas va aparte (no se suman entre sí, así el total no se duplica).
    // En las células previas el trabajo se hizo igual, marcado o no: cuenta normal.
    if (ev.celula === 'PT' && ev.esSegunda) {
      fila.segundas += 1;
      continue;
    }
    fila[columnaDeCelula(ev.celula)] += 1;
  }

  // Ventas: pares vendidos y valor por día. La maquila va a su propia columna —
  // factura plata pero no vende pares, así que sumarla a `valor` inflaría la meta
  // comercial y sumarla a `paresVendidos` contaría pares que nunca salieron.
  for (const v of input.ventas) {
    const fila = porDia.get(claveDia(v.fecha));
    if (!fila) continue;
    if (v.esServicio) {
      fila.servicios += v.valor;
      continue;
    }
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
    servicios: 0,
  };
  for (const f of filas) {
    acumulado.troquelado += f.troquelado;
    acumulado.guarnicion += f.guarnicion;
    acumulado.almacen += f.almacen;
    acumulado.inyeccion += f.inyeccion;
    acumulado.bodega += f.bodega;
    acumulado.segundas += f.segundas;
    acumulado.paresVendidos += f.paresVendidos;
    acumulado.valor += f.valor;
    acumulado.servicios += f.servicios;
  }

  // Metas: real vs objetivo del mes y, sobre todo, vs lo esperado A LA FECHA.
  // El % contra el mes entero es inútil hasta el día 30: el día 3 todo se ve en 10%
  // aunque la planta vaya perfecta.
  const metaDe = (tipo: TipoMeta) => input.metas.find((m) => m.tipo === tipo)?.valor ?? 0;
  const cumplimiento = (real: number, tipo: TipoMeta): Cumplimiento => {
    const meta = metaDe(tipo);
    const total = habilesDelMes.length;
    const esperado = total
      ? metaEsperadaALaFecha(meta, habilesTranscurridos, total)
      : meta; // sin calendario: se compara contra el mes completo, como antes
    return {
      meta,
      real,
      pct: pctCumplimiento(real, meta),
      esperado,
      pctEsperado: pctCumplimiento(real, esperado),
      diaria: metaDiaria(meta, total),
    };
  };
  const metas: BloqueMetas = {
    // Una por célula: el real sale de la misma columna que alimenta la fila diaria,
    // así el % de cumplimiento nunca se despega de lo que muestra la tabla.
    celulas: CELULAS.map((celula) => ({
      celula,
      ...cumplimiento(acumulado[columnaDeCelula(celula)], celula),
    })),
    habiles: { transcurridos: habilesTranscurridos, total: habilesDelMes.length },
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
