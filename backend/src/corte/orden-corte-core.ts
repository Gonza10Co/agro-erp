import { EstadoOrdenCorte } from '@prisma/client';

/**
 * Recorrido físico de una orden de corte. Es forward-only, igual que las células
 * de un par: una orden entregada no se devuelve a la mesa.
 */
export const ORDEN_ESTADOS_CORTE: EstadoOrdenCorte[] = [
  'PROGRAMADA',
  'EN_CORTE',
  'ENTREGADA',
  'EN_GUARNICION',
  'CERRADA',
];

/** Estado siguiente, o null si la orden ya terminó (CERRADA) o salió del flujo (ANULADA). */
export function siguienteEstadoCorte(actual: EstadoOrdenCorte): EstadoOrdenCorte | null {
  const i = ORDEN_ESTADOS_CORTE.indexOf(actual);
  if (i < 0) return null; // ANULADA no está en el recorrido
  if (i >= ORDEN_ESTADOS_CORTE.length - 1) return null;
  return ORDEN_ESTADOS_CORTE[i + 1];
}

/**
 * Solo se avanza de a un paso. Anular es la única excepción: se puede desde
 * cualquier estado vivo, pero no desde una orden ya cerrada (esos pares existen).
 */
export function esTransicionValida(desde: EstadoOrdenCorte, hasta: EstadoOrdenCorte): boolean {
  if (hasta === 'ANULADA') return desde !== 'CERRADA' && desde !== 'ANULADA';
  return siguienteEstadoCorte(desde) === hasta;
}

/** Campo de fecha que sella cada estado al entrar. De acá sale el reloj. */
const SELLOS: Partial<Record<EstadoOrdenCorte, string>> = {
  EN_CORTE: 'inicioCorte',
  ENTREGADA: 'entregaCorte',
  EN_GUARNICION: 'inicioGuarnicion',
  CERRADA: 'cierreGuarnicion',
};

export function selloDeEstado(estado: EstadoOrdenCorte): string | null {
  return SELLOS[estado] ?? null;
}

export interface LineaCorteResumen {
  cantProgramada: number;
  cantCortada: number;
  cantAmarrada: number;
}

export interface AvanceCorteResumen {
  piezasCortadas: number;
  piezasDanadas: number;
  piezasRepuestas: number;
}

export interface OrdenParaIndicadores {
  lineas: LineaCorteResumen[];
  avances: AvanceCorteResumen[];
  inicioCorte?: Date | null;
  entregaCorte?: Date | null;
  inicioGuarnicion?: Date | null;
  cierreGuarnicion?: Date | null;
}

export interface IndicadoresCorte {
  programado: number;
  cortado: number;
  amarrado: number;
  piezasCortadas: number;
  piezasDanadas: number;
  piezasRepuestas: number;
  /** cortado / programado. Null si no hay nada programado. */
  cumplimiento: number | null;
  /** repuestas / cortadas — el indicador que pidió Gabriel. */
  indiceReposicion: number | null;
  /** amarrado / cortado. */
  rendimientoGuarnicion: number | null;
  /** Pares en piso: lo cortado que todavía no llega a Amarre. */
  wip: number;
  horasCorte: number | null;
  horasGuarnicion: number | null;
}

const suma = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Divide devolviendo null en vez de NaN/Infinity cuando no hay denominador. */
function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

function horasEntre(desde?: Date | null, hasta?: Date | null): number | null {
  if (!desde || !hasta) return null;
  return (hasta.getTime() - desde.getTime()) / 3_600_000;
}

export function indicadoresDeOrden(orden: OrdenParaIndicadores): IndicadoresCorte {
  const programado = suma(orden.lineas.map((l) => l.cantProgramada));
  const cortado = suma(orden.lineas.map((l) => l.cantCortada));
  const amarrado = suma(orden.lineas.map((l) => l.cantAmarrada));
  const piezasCortadas = suma(orden.avances.map((a) => a.piezasCortadas));
  const piezasDanadas = suma(orden.avances.map((a) => a.piezasDanadas));
  const piezasRepuestas = suma(orden.avances.map((a) => a.piezasRepuestas));

  return {
    programado,
    cortado,
    amarrado,
    piezasCortadas,
    piezasDanadas,
    piezasRepuestas,
    cumplimiento: ratio(cortado, programado),
    indiceReposicion: ratio(piezasRepuestas, piezasCortadas),
    rendimientoGuarnicion: ratio(amarrado, cortado),
    wip: cortado - amarrado,
    horasCorte: horasEntre(orden.inicioCorte, orden.entregaCorte),
    horasGuarnicion: horasEntre(orden.inicioGuarnicion, orden.cierreGuarnicion),
  };
}

export type TipoAlertaCorte = 'CORTE_DEMORADO' | 'GUARNICION_DEMORADA' | 'DESVIACION_CANTIDAD' | 'REPOSICION_ALTA';

export interface AlertaCorte {
  tipo: TipoAlertaCorte;
  mensaje: string;
}

export interface UmbralesCorte {
  horasMaxCorte: number;
  horasMaxGuarnicion: number;
  /** Desviación tolerada entre lo programado y lo cortado (0.05 = 5%). */
  desviacionMax: number;
  /** Proporción de piezas repuestas tolerada (0.05 = 5%). */
  reposicionMax: number;
}

/**
 * Valores de arranque, a calibrar con el cliente cuando lleguen los datos reales
 * del jefe de corte. Una orden se corta en el día, así que 24 h ya es demora.
 */
export const UMBRALES_CORTE_DEFAULT: UmbralesCorte = {
  horasMaxCorte: 24,
  horasMaxGuarnicion: 96,
  desviacionMax: 0.05,
  reposicionMax: 0.05,
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function alertasDeOrden(orden: OrdenParaIndicadores, umbrales: UmbralesCorte): AlertaCorte[] {
  const i = indicadoresDeOrden(orden);
  const alertas: AlertaCorte[] = [];

  if (i.horasCorte !== null && i.horasCorte > umbrales.horasMaxCorte) {
    alertas.push({
      tipo: 'CORTE_DEMORADO',
      mensaje: `La orden estuvo ${i.horasCorte.toFixed(0)} h en corte (máximo ${umbrales.horasMaxCorte} h).`,
    });
  }

  if (i.horasGuarnicion !== null && i.horasGuarnicion > umbrales.horasMaxGuarnicion) {
    alertas.push({
      tipo: 'GUARNICION_DEMORADA',
      mensaje: `La orden estuvo ${i.horasGuarnicion.toFixed(0)} h en guarnición (máximo ${umbrales.horasMaxGuarnicion} h).`,
    });
  }

  if (i.cumplimiento !== null && Math.abs(1 - i.cumplimiento) > umbrales.desviacionMax) {
    alertas.push({
      tipo: 'DESVIACION_CANTIDAD',
      mensaje: `Se cortaron ${i.cortado} pares contra ${i.programado} programados (${pct(i.cumplimiento)} de cumplimiento).`,
    });
  }

  if (i.indiceReposicion !== null && i.indiceReposicion > umbrales.reposicionMax) {
    alertas.push({
      tipo: 'REPOSICION_ALTA',
      mensaje: `Se repusieron ${i.piezasRepuestas} piezas de ${i.piezasCortadas} cortadas (${pct(i.indiceReposicion)}).`,
    });
  }

  return alertas;
}

/** Una fila del formato de programación del cliente: la orden y sus columnas de talla. */
export interface FilaProgramacion {
  codigo: string;
  /** Cantidad por número de talla, tal cual las columnas 34…46 del Excel. */
  tallas: Record<number | string, number>;
}

export interface LineaProgramada {
  productoConfiguradoId: number;
  tallaId: number;
  cantProgramada: number;
}

/**
 * Convierte una fila del formato del cliente (una columna por talla) en líneas de
 * orden. Las tallas en cero se descartan: en el formato son celdas vacías del
 * rango, no renglones del pedido.
 */
export function lineasDesdeProgramacion(
  fila: FilaProgramacion,
  productoConfiguradoId: number,
  idPorTalla: Map<number, number>,
): LineaProgramada[] {
  const lineas: LineaProgramada[] = [];

  for (const [talla, cantidad] of Object.entries(fila.tallas)) {
    if (!cantidad || cantidad <= 0) continue;

    const numero = Number(talla);
    const tallaId = idPorTalla.get(numero);
    if (tallaId === undefined) {
      throw new Error(`La talla ${numero} de la orden ${fila.codigo} no existe en el catálogo`);
    }

    lineas.push({ productoConfiguradoId, tallaId, cantProgramada: cantidad });
  }

  return lineas;
}
