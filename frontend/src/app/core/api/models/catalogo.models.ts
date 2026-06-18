import { Talla } from './pedidos.models';

export interface MarcaRef { id: number; nombre: string; }
export interface ReferenciaRango { id: number; codigo: string; tallaMin: Talla; tallaMax: Talla; }
export interface ProductoConfiguradoFull {
  id: number;
  codigo: string;
  nombreComercial: string;
  marca: MarcaRef;
  referencia: ReferenciaRango;
}

export interface ReferenciaListItem { id: number; codigo: string; nombreInterno: string; }
export interface MarcaOpt { id: number; codigo: string; nombre: string; tipo: string; }
export interface OpcionOpt { id: number; codigo: string; nombre: string; }
export interface GrupoOpt { id: number; codigo: string; nombre: string; obligatorio: boolean; }
export interface EjeConfig { grupo: GrupoOpt; opciones: OpcionOpt[]; }
export interface ReferenciaConfig {
  referencia: { id: number; codigo: string; nombreInterno: string; tallaMin: number; tallaMax: number };
  marcas: MarcaOpt[];
  ejes: EjeConfig[];
}
export interface NodoBom {
  materialId: number; codigo: string; nombre: string; unidad: string;
  origen: 'COMPRADO' | 'FABRICADO'; consumo: number; hijos: NodoBom[];
}
export interface CompradoBom { materialId: number; codigo: string; nombre: string; unidad: string; consumo: number; }
export interface BomResuelto { arbol: NodoBom[]; comprados: CompradoBom[]; }
export interface ResolverParams { referenciaId: number; talla: number; marcaId?: number; opcionIds?: number[]; }

// --- Edición / versionado de BOM ---
export interface MaterialItem {
  id: number; codigo: string; nombreCanonico: string;
  origen: 'COMPRADO' | 'FABRICADO'; unidad: string;
}
// Decimales de Prisma llegan como string por JSON; el editor los normaliza con Number().
export interface BomLineaTallaData { tallaId: number; consumo: number | string; }
export interface BomLineaData {
  id: number; materialId: number; claseConsumo: 'CURVA' | 'FIJO';
  consumoFijo: number | string | null; mermaPct: number | string | null;
  lineasTalla: BomLineaTallaData[];
}
export interface BomVersionData {
  id: number; version: number; activo: boolean; vigenteDesde: string; lineas: BomLineaData[];
}
export interface BomLineaInput {
  materialId: number; claseConsumo: 'CURVA' | 'FIJO';
  consumoFijo?: number; mermaPct?: number;
  tallas?: { tallaId: number; consumo: number }[];
}
export interface CrearBomVersionPayload {
  referenciaId?: number; materialId?: number; lineas: BomLineaInput[];
}
