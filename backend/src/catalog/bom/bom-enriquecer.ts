import { BomResuelto, NodoResuelto, OrigenMaterial } from './bom-resolver.types';

export interface MetaMaterial {
  codigo: string;
  nombre: string;
  unidad: string;
}

export interface NodoConMeta {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  origen: OrigenMaterial;
  consumo: number;
  hijos: NodoConMeta[];
}

export interface CompradoConMeta {
  materialId: number;
  codigo: string;
  nombre: string;
  unidad: string;
  consumo: number;
}

export interface BomConMeta {
  arbol: NodoConMeta[];
  comprados: CompradoConMeta[];
}

const FALTANTE: MetaMaterial = { codigo: '?', nombre: '(desconocido)', unidad: '' };

export function idsDeResuelto(r: BomResuelto): number[] {
  const ids = new Set<number>();
  const visitar = (nodos: NodoResuelto[]) => {
    for (const n of nodos) {
      ids.add(n.materialId);
      visitar(n.hijos);
    }
  };
  visitar(r.arbol);
  for (const c of r.comprados) ids.add(c.materialId);
  return [...ids];
}

export function enriquecer(
  r: BomResuelto,
  meta: Record<number, MetaMaterial>,
): BomConMeta {
  const decorar = (n: NodoResuelto): NodoConMeta => {
    const m = meta[n.materialId] ?? FALTANTE;
    return {
      materialId: n.materialId,
      codigo: m.codigo,
      nombre: m.nombre,
      unidad: m.unidad,
      origen: n.origen,
      consumo: n.consumo,
      hijos: n.hijos.map(decorar),
    };
  };
  return {
    arbol: r.arbol.map(decorar),
    comprados: r.comprados.map((c) => {
      const m = meta[c.materialId] ?? FALTANTE;
      return { materialId: c.materialId, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad, consumo: c.consumo };
    }),
  };
}
