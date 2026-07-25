// Facturación de SERVICIOS (maquila, mantenimiento): línea de ingreso aparte de
// la venta de botas. No nace de un despacho — no hay producto propio que salir.

export interface ServicioCatalogo {
  id: number;
  codigo: string;
  nombre: string;
  unidad: string;
  precioBase: number | null;
  activo: boolean;
}

/** Cuántos pares llevó una línea a PT en el mes: la base para cobrar la maquila. */
export interface SugerenciaServicio {
  linea: { id: number; codigo: string; nombre: string };
  anio: number;
  mes: number;
  paresTerminados: number;
}

export interface LineaServicioParams {
  servicioId?: number;
  descripcion?: string;
  cantidad: number;
  precioUnitario: number;
}

export interface FacturarServicioParams {
  clienteId: number;
  lineaId?: number;
  ivaPct?: number;
  fecha?: string;
  lineas: LineaServicioParams[];
}
