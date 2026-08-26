export type EstadoOrdenCorte =
  | 'PROGRAMADA'
  | 'EN_CORTE'
  | 'ENTREGADA'
  | 'EN_GUARNICION'
  | 'CERRADA'
  | 'ANULADA';

/** Recorrido físico de la orden. Forward-only: una orden entregada no se devuelve. */
export const ORDEN_ESTADOS_CORTE: EstadoOrdenCorte[] = [
  'PROGRAMADA',
  'EN_CORTE',
  'ENTREGADA',
  'EN_GUARNICION',
  'CERRADA',
];

export const LABEL_ESTADO_CORTE: Record<EstadoOrdenCorte, string> = {
  PROGRAMADA: 'Programada',
  EN_CORTE: 'En corte',
  ENTREGADA: 'Entregada',
  EN_GUARNICION: 'En guarnición',
  CERRADA: 'Cerrada',
  ANULADA: 'Anulada',
};

export type TipoAlertaCorte =
  | 'CORTE_DEMORADO'
  | 'GUARNICION_DEMORADA'
  | 'DESVIACION_CANTIDAD'
  | 'REPOSICION_ALTA';

export interface AlertaCorte {
  tipo: TipoAlertaCorte;
  mensaje: string;
}

export interface IndicadoresCorte {
  programado: number;
  cortado: number;
  amarrado: number;
  piezasCortadas: number;
  piezasDanadas: number;
  piezasRepuestas: number;
  cumplimiento: number | null;
  indiceReposicion: number | null;
  rendimientoGuarnicion: number | null;
  wip: number;
  horasCorte: number | null;
  horasGuarnicion: number | null;
}

export interface OrdenCorteItem {
  id: number;
  codigo: string;
  fecha: string;
  estado: EstadoOrdenCorte;
  linea: { id: number; codigo: string; nombre: string } | null;
  marca: { id: number; codigo: string; nombre: string } | null;
  indicadores: IndicadoresCorte;
  alertas: AlertaCorte[];
}

export interface ResumenCorte {
  programado: number;
  cortado: number;
  amarrado: number;
  piezasCortadas: number;
  piezasRepuestas: number;
  piezasDanadas: number;
  cantOrdenes: number;
  cumplimiento: number | null;
  indiceReposicion: number | null;
  wip: number;
  conAlertas: number;
}

export interface TableroCorte {
  ordenes: OrdenCorteItem[];
  resumen: ResumenCorte;
}

export interface FiltrosCorte {
  lineaId?: number;
  estado?: EstadoOrdenCorte;
  desde?: string;
  hasta?: string;
}

export interface LineaOrdenCorte {
  id: number;
  productoConfigurado: {
    id: number;
    referencia: { id: number; codigo: string; nombreInterno: string } | null;
    marca: { id: number; codigo: string; nombre: string } | null;
  };
  talla: { id: number; valor: number };
  cantProgramada: number;
  cantCortada: number;
  cantAmarrada: number;
  ofId: number | null;
}

export interface ConsumoConsolidado {
  materialId: number;
  codigo: string;
  nombre: string;
  cantTeorica: number;
  cantReal: number;
  /** Cuánto se gastó de más sobre lo teórico (0.1 = 10% de más). */
  desviacion: number | null;
}

export interface AvanceCorte {
  id: number;
  fecha: string;
  piezasCortadas: number;
  piezasDanadas: number;
  piezasRepuestas: number;
  observaciones: string | null;
  operario: { id: number; nombre: string } | null;
}

export interface OrdenCorteDetalle extends OrdenCorteItem {
  observaciones: string | null;
  inicioCorte: string | null;
  entregaCorte: string | null;
  inicioGuarnicion: string | null;
  cierreGuarnicion: string | null;
  lineas: LineaOrdenCorte[];
  avances: AvanceCorte[];
  consumos: ConsumoConsolidado[];
  /** Null cuando la orden ya está cerrada o anulada: no hay botón que ofrecer. */
  siguienteEstado: EstadoOrdenCorte | null;
}
