import {
  LineaBase,
  Override,
  MaterialInfo,
  NodoResuelto,
  BomResuelto,
  EntradaResolucion,
} from './bom-resolver.types';

/** Consumo de una línea para una talla concreta, con merma aplicada. */
export function resolverConsumoTalla(linea: LineaBase, talla: number): number {
  let base: number;
  if (linea.claseConsumo === 'FIJO') {
    base = linea.consumoFijo ?? 0;
  } else {
    const valor = linea.consumoPorTalla[talla];
    if (valor === undefined) {
      throw new Error(
        `Material ${linea.materialId}: sin consumo definido para talla ${talla}`,
      );
    }
    base = valor;
  }
  const merma = linea.mermaPct ?? 0;
  return base * (1 + merma / 100);
}

const RANGO_ACCION: Record<Override['accion'], number> = {
  ADD: 0,
  SET_CONSUMO: 1,
  REPLACE: 2,
  REMOVE: 3,
};

/** Construye una LineaBase a partir de un override (para ADD o REPLACE sin heredar). */
function lineaDesdeOverride(ov: Override, piezaId: number | null = null): LineaBase {
  const tieneCurva = Object.keys(ov.consumoPorTalla).length > 0;
  return {
    materialId: ov.materialNuevoId as number,
    piezaId,
    claseConsumo: tieneCurva ? 'CURVA' : 'FIJO',
    consumoFijo: tieneCurva ? null : (ov.consumoFijo ?? 0),
    consumoPorTalla: tieneCurva ? { ...ov.consumoPorTalla } : {},
    mermaPct: null,
  };
}

/**
 * Identidad de una línea dentro de una receta. NO es el material a secas: la misma
 * micropiel puede ir en la capellada y en el talón con consumos distintos.
 */
function clave(materialId: number, piezaId: number | null): string {
  return `${materialId}|${piezaId ?? ''}`;
}

/**
 * Líneas alcanzadas por un override. Sin pieza objetivo, el override sobre la
 * micropiel alcanza a TODAS las piezas hechas de micropiel; con pieza objetivo
 * (variantes ECONOMICA/S-P) solo la línea (material, pieza).
 */
function entradasDeMaterial(
  mapa: Map<string, LineaBase>,
  materialId: number,
  piezaObjetivoId?: number | null,
): [string, LineaBase][] {
  return [...mapa.entries()].filter(
    ([, l]) =>
      l.materialId === materialId &&
      (piezaObjetivoId == null || l.piezaId === piezaObjetivoId),
  );
}

/** Aplica las reglas de override al BOM base y devuelve el conjunto efectivo de líneas. */
export function aplicarOverrides(
  base: LineaBase[],
  overrides: Override[],
): LineaBase[] {
  const mapa = new Map<string, LineaBase>();
  for (const l of base)
    mapa.set(clave(l.materialId, l.piezaId), {
      ...l,
      consumoPorTalla: { ...l.consumoPorTalla },
    });

  const ordenados = [...overrides].sort(
    (a, b) =>
      RANGO_ACCION[a.accion] - RANGO_ACCION[b.accion] || a.orden - b.orden,
  );

  for (const ov of ordenados) {
    switch (ov.accion) {
      case 'REMOVE':
        if (ov.materialObjetivoId != null)
          for (const [k] of entradasDeMaterial(mapa, ov.materialObjetivoId, ov.piezaObjetivoId))
            mapa.delete(k);
        break;
      case 'REPLACE': {
        if (ov.materialObjetivoId == null || ov.materialNuevoId == null) break;
        // El material nuevo entra en cada pieza donde estaba el viejo.
        for (const [k, objetivo] of entradasDeMaterial(mapa, ov.materialObjetivoId, ov.piezaObjetivoId)) {
          const nueva: LineaBase = ov.heredaCurva
            ? {
                ...objetivo,
                materialId: ov.materialNuevoId,
                consumoPorTalla: { ...objetivo.consumoPorTalla },
              }
            : lineaDesdeOverride(ov, objetivo.piezaId);
          mapa.delete(k);
          mapa.set(clave(ov.materialNuevoId, nueva.piezaId), nueva);
        }
        break;
      }
      case 'SET_CONSUMO': {
        if (ov.materialObjetivoId == null) break;
        const tieneCurva = Object.keys(ov.consumoPorTalla).length > 0;
        for (const [, objetivo] of entradasDeMaterial(mapa, ov.materialObjetivoId, ov.piezaObjetivoId)) {
          if (tieneCurva) {
            objetivo.claseConsumo = 'CURVA';
            objetivo.consumoPorTalla = { ...ov.consumoPorTalla };
            objetivo.consumoFijo = null;
          } else {
            objetivo.claseConsumo = 'FIJO';
            objetivo.consumoFijo = ov.consumoFijo ?? 0;
            objetivo.consumoPorTalla = {};
          }
        }
        break;
      }
      case 'ADD':
        if (ov.materialNuevoId != null) {
          // Con pieza objetivo, la línea nueva entra en esa pieza (no en "bota completa").
          const nueva = lineaDesdeOverride(ov, ov.piezaObjetivoId ?? null);
          mapa.set(clave(nueva.materialId, nueva.piezaId), nueva);
        }
        break;
    }
  }

  return [...mapa.values()];
}

/**
 * Explota las líneas a un árbol de nodos resueltos para la talla, bajando a sub-BOMs.
 * `ruta` lleva los materiales FABRICADO ancestros para detectar ciclos (un BOM que se
 * contiene a sí mismo, directa o indirectamente) y lanzar un error claro en vez de
 * desbordar la pila por recursión infinita.
 */
export function explotarMultinivel(
  lineas: LineaBase[],
  materiales: Record<number, MaterialInfo>,
  talla: number,
  factor = 1,
  ruta: number[] = [],
): NodoResuelto[] {
  return lineas.map((linea) => {
    const consumo = resolverConsumoTalla(linea, talla) * factor;
    const info = materiales[linea.materialId];
    const origen = info?.origen ?? 'COMPRADO';
    let hijos: NodoResuelto[] = [];
    if (info?.origen === 'FABRICADO') {
      if (ruta.includes(linea.materialId)) {
        throw new Error(
          `Ciclo en el BOM: el material ${linea.materialId} se contiene a sí mismo ` +
            `(ruta: ${[...ruta, linea.materialId].join(' → ')})`,
        );
      }
      hijos = explotarMultinivel(info.subBom, materiales, talla, consumo, [
        ...ruta,
        linea.materialId,
      ]);
    }
    return { materialId: linea.materialId, consumo, origen, hijos };
  });
}

/** Recorre el árbol y suma el consumo de las hojas COMPRADO por material. */
export function consolidarComprados(
  arbol: NodoResuelto[],
): { materialId: number; consumo: number }[] {
  const acc = new Map<number, number>();
  const visitar = (nodos: NodoResuelto[]): void => {
    for (const n of nodos) {
      if (n.origen === 'COMPRADO' && n.hijos.length === 0) {
        acc.set(n.materialId, (acc.get(n.materialId) ?? 0) + n.consumo);
      } else {
        visitar(n.hijos);
      }
    }
  };
  visitar(arbol);
  return [...acc.entries()].map(([materialId, consumo]) => ({
    materialId,
    consumo,
  }));
}

/** Orquesta la resolución completa: overrides → explosión multinivel → consolidación. */
export function resolverBom(entrada: EntradaResolucion): BomResuelto {
  const efectivas = aplicarOverrides(entrada.lineasBase, entrada.overrides);
  const arbol = explotarMultinivel(
    efectivas,
    entrada.materiales,
    entrada.talla,
  );
  const comprados = consolidarComprados(arbol);
  return { arbol, comprados };
}
