// Tipos en memoria del resolvedor de BOM. Sin dependencias de Prisma:
// el loader convierte filas de Prisma a estos tipos y el resolvedor opera sobre ellos.

export type ClaseConsumo = 'CURVA' | 'FIJO';
export type OrigenMaterial = 'COMPRADO' | 'FABRICADO';
export type AccionOverride = 'ADD' | 'REPLACE' | 'REMOVE' | 'SET_CONSUMO';

/** Una línea de BOM, independiente de la talla. consumoPorTalla mapea valor de talla → consumo. */
export interface LineaBase {
  materialId: number;
  claseConsumo: ClaseConsumo;
  consumoFijo: number | null;
  consumoPorTalla: Record<number, number>; // {} si claseConsumo === 'FIJO'
  mermaPct: number | null;
}

/** Regla de override ya filtrada (aplica a la selección actual). */
export interface Override {
  accion: AccionOverride;
  /** Orden de aplicación dentro de su acción; menor = mayor prioridad. Marca = 0. */
  orden: number;
  materialObjetivoId: number | null;
  materialNuevoId: number | null;
  consumoFijo: number | null;
  heredaCurva: boolean;
  consumoPorTalla: Record<number, number>;
}

/** Metadato de material para la explosión multinivel. */
export interface MaterialInfo {
  id: number;
  origen: OrigenMaterial;
  subBom: LineaBase[]; // [] si COMPRADO
}

/** Nodo del árbol resuelto (un material con su consumo ya calculado para la talla). */
export interface NodoResuelto {
  materialId: number;
  consumo: number;
  origen: OrigenMaterial;
  hijos: NodoResuelto[];
}

export interface BomResuelto {
  arbol: NodoResuelto[];
  comprados: { materialId: number; consumo: number }[];
}

export interface EntradaResolucion {
  lineasBase: LineaBase[];
  overrides: Override[];
  talla: number;
  materiales: Record<number, MaterialInfo>; // indexado por materialId
}
