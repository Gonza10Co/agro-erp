import { CalidadPT } from './pedidos.models';

/** Pedido vivo que puede recibir pares de esa talla (tiene la línea y le faltan). */
export interface ReassignmentTarget {
  opId: number;
  opConsecutivo: number;
  ocConsecutivo: number | null;
  ocCliente: string | null;
  cliente: string;
  pendiente: number;
}

/** Lo que la OP tiene reservado de un producto × talla × calidad, con sus posibles destinos. */
export interface ReassignmentOption {
  productoConfiguradoId: number;
  producto: string;
  tallaId: number;
  talla: number | null;
  calidad: CalidadPT;
  reservado: number;
  targets: ReassignmentTarget[];
}

export interface ReleasePtBody {
  productoConfiguradoId: number;
  tallaId: number;
  calidad: CalidadPT;
  quantity: number;
  reason: string;
}

export interface ReassignPtBody extends ReleasePtBody {
  toOpId: number;
}

interface OpRef {
  id: number;
  consecutivo: number;
  oc?: { consecutivo: number; cliente?: { nombre: string } } | null;
}

/** Registro auditable: de qué pedido salieron, a cuál fueron (null = liberados), quién y por qué. */
export interface PtReassignment {
  id: number;
  fromOpId: number;
  toOpId: number | null;
  productoConfiguradoId: number;
  tallaId: number;
  calidad: CalidadPT;
  quantity: number;
  reason: string;
  userId: number;
  createdAt: string;
  fromOp?: OpRef;
  toOp?: OpRef | null;
  productoConfigurado?: { nombreComercial: string };
  talla?: { valor: number };
  user?: { username: string };
}
