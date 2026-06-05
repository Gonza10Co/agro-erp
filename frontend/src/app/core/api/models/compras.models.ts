export interface LineaRequerimiento {
  materialId: number;
  materialCodigo: string;
  materialNombre: string;
  proveedorId: number | null;
  proveedorNombre: string | null;
  cantNecesaria: number;
  cantDisponible: number;
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
  grupos: GrupoRequerimiento[];
}
