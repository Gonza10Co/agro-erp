export type EstadoOC = 'BORRADOR' | 'CONFIRMADA' | 'EN_PRODUCCION' | 'CERRADA' | 'ANULADA';
export type EstadoOP = 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'ANULADA';
export type TipoCredito = 'CONTADO' | 'D30' | 'D60' | 'D90';
export type EstadoCartera = 'AL_DIA' | 'VENCIDO' | 'BLOQUEADO';
export type TipoBodega = 'PROPIA' | 'HERMANA';

export interface Cliente {
  id: number;
  nit: string;
  nombre: string;
  ciudad?: string | null;
  tipoCredito: TipoCredito;
  cupo?: string | null;
  estadoCartera: EstadoCartera;
  activo: boolean;
}

export interface Talla { id: number; valor: number; orden: number; }

export interface ProductoConfigurado {
  id: number;
  codigo: string;
  nombreComercial: string;
  referenciaId: number;
  marcaId: number;
}

export interface OCLineaTalla { id: number; tallaId: number; cantidad: number; talla?: Talla; }
export interface OCLinea {
  id: number;
  productoConfiguradoId: number;
  productoConfigurado?: ProductoConfigurado;
  tallas: OCLineaTalla[];
}
export interface OrdenCompra {
  id: number;
  consecutivo: number;
  ocCliente?: string | null;
  clienteId: number;
  cliente?: Cliente;
  fecha: string;
  estado: EstadoOC;
  observaciones?: string | null;
  lineas?: OCLinea[];
  ordenProduccion?: { id: number; consecutivo: number; estado: EstadoOP } | null;
}

export interface ReservaInventarioPT {
  id: number;
  inventarioPTId: number;
  cantidad: number;
  inventarioPT?: { id: number; bodegaId: number; bodega?: { id: number; codigo: string; nombre: string } };
}
export interface OPLineaTalla {
  id: number;
  tallaId: number;
  cantPedida: number;
  cantAmarrada: number;
  cantAProducir: number;
  talla?: Talla;
  reservas?: ReservaInventarioPT[];
}
export interface OPLinea {
  id: number;
  productoConfiguradoId: number;
  productoConfigurado?: ProductoConfigurado;
  tallas: OPLineaTalla[];
}
export interface OrdenProduccion {
  id: number;
  consecutivo: number;
  ocId: number;
  oc?: OrdenCompra;
  fecha: string;
  estado: EstadoOP;
  lineas?: OPLinea[];
}

export interface CrearClienteDto { nit: string; nombre: string; ciudad?: string; tipoCredito?: TipoCredito; cupo?: number; }
export interface CrearOCTallaDto { tallaId: number; cantidad: number; }
export interface CrearOCLineaDto { productoConfiguradoId: number; tallas: CrearOCTallaDto[]; }
export interface CrearOCDto { clienteId: number; ocCliente?: string; observaciones?: string; lineas: CrearOCLineaDto[]; }
