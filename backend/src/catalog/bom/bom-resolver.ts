import { LineaBase, Override, MaterialInfo, NodoResuelto } from './bom-resolver.types';

/** Consumo de una línea para una talla concreta, con merma aplicada. */
export function resolverConsumoTalla(linea: LineaBase, talla: number): number {
  let base: number;
  if (linea.claseConsumo === 'FIJO') {
    base = linea.consumoFijo ?? 0;
  } else {
    const valor = linea.consumoPorTalla[talla];
    if (valor === undefined) {
      throw new Error(`Material ${linea.materialId}: sin consumo definido para talla ${talla}`);
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
function lineaDesdeOverride(ov: Override): LineaBase {
  const tieneCurva = Object.keys(ov.consumoPorTalla).length > 0;
  return {
    materialId: ov.materialNuevoId as number,
    claseConsumo: tieneCurva ? 'CURVA' : 'FIJO',
    consumoFijo: tieneCurva ? null : (ov.consumoFijo ?? 0),
    consumoPorTalla: tieneCurva ? { ...ov.consumoPorTalla } : {},
    mermaPct: null,
  };
}

/** Aplica las reglas de override al BOM base y devuelve el conjunto efectivo de líneas. */
export function aplicarOverrides(base: LineaBase[], overrides: Override[]): LineaBase[] {
  const mapa = new Map<number, LineaBase>();
  for (const l of base) mapa.set(l.materialId, { ...l, consumoPorTalla: { ...l.consumoPorTalla } });

  const ordenados = [...overrides].sort(
    (a, b) => RANGO_ACCION[a.accion] - RANGO_ACCION[b.accion] || a.orden - b.orden,
  );

  for (const ov of ordenados) {
    switch (ov.accion) {
      case 'REMOVE':
        if (ov.materialObjetivoId != null) mapa.delete(ov.materialObjetivoId);
        break;
      case 'REPLACE': {
        if (ov.materialObjetivoId == null || ov.materialNuevoId == null) break;
        const objetivo = mapa.get(ov.materialObjetivoId);
        if (!objetivo) break;
        const nueva: LineaBase = ov.heredaCurva
          ? { ...objetivo, materialId: ov.materialNuevoId, consumoPorTalla: { ...objetivo.consumoPorTalla } }
          : lineaDesdeOverride(ov);
        mapa.delete(ov.materialObjetivoId);
        mapa.set(ov.materialNuevoId, nueva);
        break;
      }
      case 'SET_CONSUMO': {
        if (ov.materialObjetivoId == null) break;
        const objetivo = mapa.get(ov.materialObjetivoId);
        if (!objetivo) break;
        const tieneCurva = Object.keys(ov.consumoPorTalla).length > 0;
        if (tieneCurva) {
          objetivo.claseConsumo = 'CURVA';
          objetivo.consumoPorTalla = { ...ov.consumoPorTalla };
          objetivo.consumoFijo = null;
        } else {
          objetivo.claseConsumo = 'FIJO';
          objetivo.consumoFijo = ov.consumoFijo ?? 0;
          objetivo.consumoPorTalla = {};
        }
        break;
      }
      case 'ADD':
        if (ov.materialNuevoId != null) mapa.set(ov.materialNuevoId, lineaDesdeOverride(ov));
        break;
    }
  }

  return [...mapa.values()];
}

/** Explota las líneas a un árbol de nodos resueltos para la talla, bajando a sub-BOMs. */
export function explotarMultinivel(
  lineas: LineaBase[],
  materiales: Record<number, MaterialInfo>,
  talla: number,
  factor = 1,
): NodoResuelto[] {
  return lineas.map((linea) => {
    const consumo = resolverConsumoTalla(linea, talla) * factor;
    const info = materiales[linea.materialId];
    const origen = info?.origen ?? 'COMPRADO';
    const hijos =
      info?.origen === 'FABRICADO'
        ? explotarMultinivel(info.subBom, materiales, talla, consumo)
        : [];
    return { materialId: linea.materialId, consumo, origen, hijos };
  });
}
