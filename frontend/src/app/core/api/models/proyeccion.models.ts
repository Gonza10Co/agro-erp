// Espejo de backend/src/pedidos/proyeccion/proyeccion-core.ts

export type EstadoProyeccion = 'EN_BODEGA' | 'A_TIEMPO' | 'ATRASADO' | 'SIN_CUPO';

export interface BloqueDia {
  ocId: number;
  consecutivo: number;
  cliente: string;
  pares: number;
  /** Lo cortado este día queda listo después del compromiso del pedido. */
  tarde: boolean;
}

export interface DiaProyectado {
  fecha: string;
  capacidad: number;
  usado: number;
  libre: number;
  bloques: BloqueDia[];
}

export interface TallaProyectada {
  talla: number;
  pedida: number;
  deBodega: number;
  aProducir: number;
}

export interface PedidoProyectado {
  ocId: number;
  consecutivo: number;
  cliente: string;
  ocCliente: string | null;
  productos: string[];
  referencias: string[];
  marcas: string[];
  tieneOP: boolean;
  pares: number;
  deBodega: number;
  aProducir: number;
  sinCupo: number;
  compromiso: string;
  compromisoEstimado: boolean;
  /** Primer y último día de corte. */
  inicio: string | null;
  finCorte: string | null;
  /** Día en que el último par entra a producto terminado. */
  fin: string | null;
  diasAtraso: number;
  estado: EstadoProyeccion;
  tallas: TallaProyectada[];
}

export interface DisponibleVenta {
  productoConfiguradoId: number;
  producto: string;
  referencia: string | null;
  marca: string | null;
  calidad: string;
  tallas: { talla: number; pares: number }[];
  total: number;
}

export interface Proyeccion {
  hoy: string;
  paresPorDia: number;
  /** Días hábiles de corte a producto terminado. */
  diasProceso: number;
  disponible: DisponibleVenta[];
  dias: DiaProyectado[];
  pedidos: PedidoProyectado[];
  resumen: {
    pedidos: number;
    pares: number;
    deBodega: number;
    aProducir: number;
    atrasados: number;
    sinCupo: number;
    hastaCuando: string | null;
    primerCupoLibre: string | null;
    paresLibresEnVentana: number;
    paresParaVender: number;
  };
}
