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
