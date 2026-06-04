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
