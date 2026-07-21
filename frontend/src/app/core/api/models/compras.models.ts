export interface LineaRequerimiento {
  materialId: number;
  materialCodigo: string;
  materialNombre: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  cantNecesaria: number;
  cantDisponible: number;
  /** Amarre de insumos: lo que este pedido reservó de bodega al calcularse. */
  cantReservada: number;
  cantAComprar: number;
}

export interface GrupoRequerimiento {
  proveedor: { id: number; nombre: string } | null;
  lineas: LineaRequerimiento[];
}

export interface Requerimiento {
  id: number;
  consecutivo: number;
  opId: number;
  fecha: string;
  estado?: 'CALCULADO' | 'CON_ORDEN';
  /** false = el amarre ya se liberó (OP anulada/despachada o recálculo posterior). */
  reservaActiva?: boolean;
  grupos: GrupoRequerimiento[];
}

/** Fila del listado de requerimientos de una OP (GET /requerimientos?opId). */
export interface RequerimientoResumen {
  id: number;
  consecutivo: number;
  fecha: string;
  reservaActiva: boolean;
}

// ── Demo 13: OCP a proveedor ──

export type EstadoOcp = 'PENDIENTE' | 'PARCIAL' | 'COMPLETA';

export interface OcpResumen {
  id: number;
  consecutivo: number;
  proveedor: { id: number; nombre: string };
  requerimiento: { id: number; consecutivo: number } | null;
  fecha: string;
  estado: EstadoOcp;
  totalPedido: number;
  totalRecibido: number;
}

export interface OcpLinea {
  id: number;
  materialId: number;
  materialCodigo: string;
  materialNombre: string;
  unidad: string;
  cantPedida: number;
  cantRecibida: number;
  pendiente: number;
}

export interface RecepcionCompra {
  id: number;
  consecutivo: number;
  fecha: string;
  observaciones: string | null;
  lineas: { ocpLineaId: number; cantidad: number }[];
}

export interface DevolucionProveedor {
  id: number;
  consecutivo: number;
  fecha: string;
  causa: string;
  observaciones: string | null;
  lineas: {
    materialId: number;
    materialCodigo?: string;
    materialNombre?: string;
    cantidad: number;
  }[];
}

export interface OcpDetalle {
  id: number;
  consecutivo: number;
  proveedor: { id: number; nombre: string };
  requerimiento: { id: number; consecutivo: number } | null;
  fecha: string;
  estado: EstadoOcp;
  observaciones: string | null;
  lineas: OcpLinea[];
  recepciones: RecepcionCompra[];
  devoluciones: DevolucionProveedor[];
}

export interface ResultadoGenerarOrdenes {
  ordenes: {
    id: number;
    consecutivo: number;
    proveedor: { id: number; nombre: string };
    totalLineas: number;
  }[];
  sinProveedor: {
    materialId: number;
    codigo: string;
    nombre: string;
    cantAComprar: number;
  }[];
}

export interface RegistrarRecepcionDto {
  lineas: { ocpLineaId: number; cantidad: number; costoUnitario?: number }[];
  observaciones?: string;
}

export interface RegistrarDevolucionDto {
  causa: string;
  lineas: { materialId: number; cantidad: number }[];
  observaciones?: string;
}
