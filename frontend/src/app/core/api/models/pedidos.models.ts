export type EstadoOC = 'BORRADOR' | 'CONFIRMADA' | 'EN_PRODUCCION' | 'CERRADA' | 'ANULADA';
export type EstadoOP = 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'DESPACHADA' | 'ANULADA';
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
  precioUnitario?: string | null; // Decimal serializado como string
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
export interface CrearOCLineaDto { productoConfiguradoId: number; precioUnitario?: number; tallas: CrearOCTallaDto[]; }
export interface CrearOCDto { clienteId: number; ocCliente?: string; observaciones?: string; lineas: CrearOCLineaDto[]; }

export interface DespacharParams { opId: number; autorizar?: boolean; motivo?: string; }
export interface DespachoListItem {
  id: number;
  consecutivo: number;
  fecha: string;
  autorizadoPorId: number | null;
  factura: { id: number; consecutivo: number } | null;
  op: { consecutivo: number; oc: { cliente: { nombre: string } } };
}
export interface Despacho { id: number; consecutivo: number; }

// ─── Facturación ───────────────────────────────────────────────────────────
export type EstadoFactura = 'EMITIDA' | 'ANULADA';

export interface FacturarParams { despachoId: number; ivaPct?: number; }

export interface FacturaListItem {
  id: number;
  consecutivo: number;
  fecha: string;
  total: string;
  estado: EstadoFactura;
  despacho: { consecutivo: number; op: { consecutivo: number; oc: { cliente: { nombre: string } } } };
}

export interface FacturaLinea {
  id: number;
  productoConfiguradoId: number;
  productoConfigurado?: ProductoConfigurado;
  tallaId: number;
  talla?: Talla;
  cantidad: number;
  precioUnitario: string;
  subtotal: string;
}

export interface Factura {
  id: number;
  consecutivo: number;
  despachoId: number;
  fecha: string;
  fechaVencimiento?: string | null;
  subtotal: string;
  ivaPct: string;
  iva: string;
  total: string;
  estado: EstadoFactura;
  despacho?: { consecutivo: number; op: { consecutivo: number; oc: { consecutivo: number; cliente: Cliente } } };
  lineas?: FacturaLinea[];
}

// ─── Cartera / Cuentas por cobrar ────────────────────────────────────────────
export interface CarteraItem {
  facturaId: number;
  consecutivo: number;
  cliente: { id: number; nombre: string };
  total: number;
  pagado: number;
  saldo: number;
  fecha: string;
  fechaVencimiento: string | null;
  vencida: boolean;
}

export interface RegistrarPagoParams { facturaId: number; monto: number; medio?: string; }

export interface Pago { id: number; monto: string; fecha: string; medio?: string | null; }

export interface ResumenCartera { facturado: number; pagado: number; saldo: number; saldoVencido: number; }

export interface CarteraClienteFactura {
  facturaId: number;
  consecutivo: number;
  total: number;
  pagado: number;
  saldo: number;
  fecha: string;
  fechaVencimiento: string | null;
  estado: EstadoFactura;
  pagos: Pago[];
}

export interface CarteraCliente {
  clienteId: number;
  resumen: ResumenCartera;
  facturas: CarteraClienteFactura[];
}
