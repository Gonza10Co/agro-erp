export type EstadoOC = 'BORRADOR' | 'CONFIRMADA' | 'EN_PRODUCCION' | 'CERRADA' | 'ANULADA';
export type EstadoDemora = 'VERDE' | 'AMARILLO' | 'ROJO' | 'RETENIDA_CARTERA';
export type EstadoOP = 'CREADA' | 'AMARRADA' | 'EN_PRODUCCION' | 'DESPACHADA' | 'ANULADA';
export type TipoCredito = 'CONTADO' | 'D10' | 'D15' | 'D30' | 'D60' | 'D90';
export type EstadoCartera = 'AL_DIA' | 'VENCIDO' | 'BLOQUEADO';
export type TipoBodega = 'PROPIA' | 'HERMANA';

export interface Cliente {
  id: number;
  nit: string;
  nombre: string;
  ciudad?: string | null; // ciudad fiscal, NO la de entrega
  telefono?: string | null;
  direccion?: string | null; // domicilio / dirección fiscal
  tipoCredito: TipoCredito;
  cupo?: string | null;
  estadoCartera: EstadoCartera;
  activo: boolean;
  // Solo viene en el detalle (GET /clientes/:id). A dónde se le despacha.
  sedes?: SedeCliente[];
}

/** Sede de entrega de un cliente. La marcada como principal es el destino por defecto. */
export interface SedeCliente {
  id: number;
  clienteId: number;
  nombre: string;
  ciudad: string;
  direccion: string;
  telefono?: string | null;
  esPrincipal: boolean;
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
  /** Grado pedido: una segunda se vende a otro precio y sale de otro saldo. */
  calidad?: 'PRIMERA' | 'SEGUNDA';
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
  fechaConfirmacion?: string | null;
  estado: EstadoOC;
  observaciones?: string | null;
  sedeEntregaId?: number | null;
  sedeEntrega?: SedeCliente | null;
  /** Snapshot congelado al crear la OC; no se relee de la sede. */
  direccionDespacho?: string | null;
  /** Línea de producción del pedido (se decide por pedido, no por marca). */
  lineaId?: number | null;
  linea?: { id: number; codigo: string; nombre: string } | null;
  /** Orden de mínimos: se fabrica para reponer la bodega, su OP no amarra PT. */
  paraStock?: boolean;
  /** Fecha prometida al cliente (ISO; el día está en los 10 primeros caracteres). */
  fechaEntrega?: string | null;
  /** Día en que el cliente puso el pedido (ISO; distinta de `fecha`, que es cuando se subió al ERP). */
  fechaPedidoCliente?: string | null;
  lineas?: OCLinea[];
  ordenProduccion?: { id: number; consecutivo: number; estado: EstadoOP } | null;
  /** Solo en la lista: cómo va el despacho de su OP (null si no tiene OP). */
  dispatch?: DispatchSummary | null;
  // Semáforo de demora calculado por el backend en el listado (no se persiste).
  diasDemora?: number | null;
  estadoDemora?: EstadoDemora | null;
}

export interface ResumenCosteoOC {
  totalVenta: number;
  costoTotal: number;
  utilidad: number;
  margenPct: number;
  materialesSinCosto: number;
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
  /** Pares que gerencia pasó a otro pedido o liberó: ya están sumados en cantAProducir. */
  reassignedOut?: number;
  /** Pares de esta talla que ya salieron en despachos (parciales o el total). */
  dispatched?: number;
  talla?: Talla;
  reservas?: ReservaInventarioPT[];
}
export interface OPLinea {
  id: number;
  productoConfiguradoId: number;
  productoConfigurado?: ProductoConfigurado;
  /** Heredado de la OC: define de qué saldo descarga el despacho. */
  calidad?: 'PRIMERA' | 'SEGUNDA';
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
  /** Solo en la lista: cómo va el despacho. */
  dispatch?: DispatchSummary | null;
  /** Solo en el detalle: las entregas del pedido en orden. */
  despachos?: OPDelivery[];
}

/** Resumen del despacho de una OP para las listas de pedidos. */
export interface DispatchSummary {
  deliveries: number;
  dispatchedPairs: number;
  neededPairs: number;
  /** Ya salió algo pero el pedido sigue abierto. */
  partial: boolean;
}

/** Una entrega (despacho) de la OP, con su número dentro del pedido. */
export interface OPDelivery {
  id: number;
  consecutivo: number;
  fecha: string;
  deliveryNumber: number;
  isFinal: boolean;
  lineas?: { cantidad: number }[];
  factura?: { id: number; consecutivo: number } | null;
}

export interface CrearClienteDto { nit: string; nombre: string; ciudad?: string; telefono?: string; direccion?: string; tipoCredito?: TipoCredito; cupo?: number; }
export interface CrearSedeDto { nombre: string; ciudad: string; direccion: string; telefono?: string; esPrincipal?: boolean; }
export interface CrearOCTallaDto { tallaId: number; cantidad: number; }
export type CalidadPT = 'PRIMERA' | 'SEGUNDA';
export interface CrearOCLineaDto { productoConfiguradoId: number; calidad?: CalidadPT; precioUnitario?: number; tallas: CrearOCTallaDto[]; }
export interface CrearOCDto { clienteId: number; ocCliente?: string; observaciones?: string; sedeEntregaId?: number; direccionDespacho?: string; lineaId?: number; paraStock?: boolean; fechaEntrega?: string; fechaPedidoCliente?: string; lineas: CrearOCLineaDto[]; }

/** Cuántos pares de una talla de la OP salen en el despacho (despacho parcial). */
export interface DispatchLine { opLineaTallaId: number; quantity: number; }
/** Sin `lines` sale todo lo reservado (la OP tiene que estar completa). */
export interface DespacharParams { opId: number; autorizar?: boolean; motivo?: string; lines?: DispatchLine[]; }
export interface DespachoListItem {
  id: number;
  consecutivo: number;
  fecha: string;
  direccionEntrega?: string | null;
  autorizadoPorId: number | null;
  /** Número de entrega dentro de la OP ("Entrega 2") y si fue la que la cerró. */
  deliveryNumber?: number;
  isFinal?: boolean;
  factura: { id: number; consecutivo: number } | null;
  lineas?: { cantidad: number }[];
  op: { consecutivo: number; estado?: EstadoOP; _count?: { despachos: number }; oc: { cliente: { nombre: string } } };
}
/** `opClosed`: con este despacho la OP quedó completa y se cerró. */
export interface Despacho { id: number; consecutivo: number; opClosed?: boolean; }

// ─── Facturación ───────────────────────────────────────────────────────────
export type EstadoFactura = 'EMITIDA' | 'ANULADA';

export interface FacturarParams { despachoId: number; ivaPct?: number; }

export type TipoFactura = 'PRODUCTO' | 'SERVICIO';

export interface FacturaListItem {
  id: number;
  consecutivo: number;
  tipo: TipoFactura;
  fecha: string;
  total: string;
  estado: EstadoFactura;
  /** Denormalizado: una factura de servicio no tiene despacho que navegar. */
  cliente: { nombre: string };
  linea: { codigo: string; nombre: string } | null;
  despacho: { consecutivo: number; deliveryNumber?: number; isFinal?: boolean; op: { consecutivo: number } } | null;
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
  /** El detalle trae el cliente en la factura misma (las de servicio no tienen despacho). */
  cliente?: Pick<Cliente, 'id' | 'nombre' | 'nit'>;
  despacho?: { consecutivo: number; deliveryNumber?: number; isFinal?: boolean; op: { consecutivo: number; oc: { consecutivo: number; cliente: Cliente } } };
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

/** GET /pedidos/oc/export: una fila por pedido. Fechas en 'YYYY-MM-DD'. */
export interface FilaPedidoExport {
  consecutivo: number;
  ocCliente: string | null;
  cliente: string;
  nit: string | null;
  sede: string | null;
  ciudadEntrega: string | null;
  linea: string | null;
  paraStock: boolean;
  estado: EstadoOC;
  fechaPedidoCliente: string | null;
  fechaSubida: string;
  fechaConfirmacion: string | null;
  fechaEntrega: string | null;
  opConsecutivo: number | null;
  opEstado: EstadoOP | null;
  referencias: string;
  marcas: string;
  productos: string;
  totalPares: number;
  deBodega: number;
  aProducir: number;
  despachados: number;
  /** Cuántas entregas (despachos) lleva el pedido. */
  entregas: number;
  pendientes: number;
  valor: number | null;
  observaciones: string | null;
}

/** GET /pedidos/oc/export: una fila por pedido × producto × talla. */
export interface FilaPedidoTallaExport {
  consecutivo: number;
  ocCliente: string | null;
  cliente: string;
  nit: string | null;
  linea: string | null;
  paraStock: boolean;
  estado: EstadoOC;
  fechaPedidoCliente: string | null;
  fechaSubida: string;
  fechaConfirmacion: string | null;
  fechaEntrega: string | null;
  referencia: string;
  marca: string;
  producto: string;
  codigo: string;
  calidad: CalidadPT;
  talla: number;
  cantidad: number;
  deBodega: number;
  aProducir: number;
  despachados: number;
  pendientes: number;
  opConsecutivo: number | null;
  opEstado: EstadoOP | null;
  precioUnitario: number | null;
  valor: number | null;
  observaciones: string | null;
}

export interface PedidosExport { pedidos: FilaPedidoExport[]; tallas: FilaPedidoTallaExport[]; }
