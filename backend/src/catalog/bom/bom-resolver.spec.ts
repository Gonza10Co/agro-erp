import { resolverConsumoTalla } from './bom-resolver';
import { LineaBase } from './bom-resolver.types';

import { aplicarOverrides } from './bom-resolver';
import { Override } from './bom-resolver.types';

function lineaFija(materialId: number, consumo: number): LineaBase {
  return { materialId, claseConsumo: 'FIJO', consumoFijo: consumo, consumoPorTalla: {}, mermaPct: null };
}

describe('resolverConsumoTalla', () => {
  it('CURVA: devuelve el consumo de la talla pedida', () => {
    const linea: LineaBase = {
      materialId: 1, claseConsumo: 'CURVA', consumoFijo: null,
      consumoPorTalla: { 38: 0.104, 42: 0.107 }, mermaPct: null,
    };
    expect(resolverConsumoTalla(linea, 42)).toBeCloseTo(0.107, 5);
  });

  it('FIJO: ignora la talla y devuelve consumoFijo', () => {
    const linea: LineaBase = {
      materialId: 2, claseConsumo: 'FIJO', consumoFijo: 1,
      consumoPorTalla: {}, mermaPct: null,
    };
    expect(resolverConsumoTalla(linea, 42)).toBe(1);
  });

  it('aplica mermaPct sobre el consumo', () => {
    const linea: LineaBase = {
      materialId: 3, claseConsumo: 'FIJO', consumoFijo: 1,
      consumoPorTalla: {}, mermaPct: 10,
    };
    expect(resolverConsumoTalla(linea, 42)).toBeCloseTo(1.1, 5);
  });

  it('CURVA: lanza error si la talla no está en la curva', () => {
    const linea: LineaBase = {
      materialId: 1, claseConsumo: 'CURVA', consumoFijo: null,
      consumoPorTalla: { 38: 0.1 }, mermaPct: null,
    };
    expect(() => resolverConsumoTalla(linea, 99)).toThrow(/talla 99/i);
  });
});

describe('aplicarOverrides', () => {
  const base: LineaBase[] = [
    { materialId: 10, claseConsumo: 'CURVA', consumoFijo: null, consumoPorTalla: { 42: 0.1 }, mermaPct: null }, // micropiel negra
    lineaFija(20, 0.094), // forro rossy
  ];

  it('ADD: agrega un material nuevo', () => {
    const ov: Override[] = [{
      accion: 'ADD', orden: 0, materialObjetivoId: null, materialNuevoId: 99,
      consumoFijo: 1, heredaCurva: false, consumoPorTalla: {},
    }];
    const r = aplicarOverrides(base, ov);
    expect(r.find((l) => l.materialId === 99)).toMatchObject({ claseConsumo: 'FIJO', consumoFijo: 1 });
    expect(r).toHaveLength(3);
  });

  it('REMOVE: quita el material objetivo', () => {
    const ov: Override[] = [{
      accion: 'REMOVE', orden: 0, materialObjetivoId: 20, materialNuevoId: null,
      consumoFijo: null, heredaCurva: false, consumoPorTalla: {},
    }];
    const r = aplicarOverrides(base, ov);
    expect(r.find((l) => l.materialId === 20)).toBeUndefined();
    expect(r).toHaveLength(1);
  });

  it('REPLACE con heredaCurva: cambia el material pero conserva la curva del objetivo', () => {
    const ov: Override[] = [{
      accion: 'REPLACE', orden: 0, materialObjetivoId: 10, materialNuevoId: 11, // micropiel café
      consumoFijo: null, heredaCurva: true, consumoPorTalla: {},
    }];
    const r = aplicarOverrides(base, ov);
    expect(r.find((l) => l.materialId === 10)).toBeUndefined();
    expect(r.find((l) => l.materialId === 11)).toMatchObject({
      claseConsumo: 'CURVA', consumoPorTalla: { 42: 0.1 },
    });
  });

  it('SET_CONSUMO: reescribe el consumo del material objetivo', () => {
    const ov: Override[] = [{
      accion: 'SET_CONSUMO', orden: 0, materialObjetivoId: 20, materialNuevoId: null,
      consumoFijo: 0.2, heredaCurva: false, consumoPorTalla: {},
    }];
    const r = aplicarOverrides(base, ov);
    expect(r.find((l) => l.materialId === 20)).toMatchObject({ consumoFijo: 0.2 });
  });

  it('precedencia: REMOVE gana sobre ADD del mismo material', () => {
    const ov: Override[] = [
      { accion: 'ADD', orden: 0, materialObjetivoId: null, materialNuevoId: 20, consumoFijo: 5, heredaCurva: false, consumoPorTalla: {} },
      { accion: 'REMOVE', orden: 0, materialObjetivoId: 20, materialNuevoId: null, consumoFijo: null, heredaCurva: false, consumoPorTalla: {} },
    ];
    const r = aplicarOverrides(base, ov);
    expect(r.find((l) => l.materialId === 20)).toBeUndefined();
  });
});

import { explotarMultinivel } from './bom-resolver';
import { MaterialInfo, NodoResuelto } from './bom-resolver.types';

describe('explotarMultinivel', () => {
  // material 1 = COMPRADO (cuero); material 2 = FABRICADO (plantilla PU) con sub-BOM
  const materiales: Record<number, MaterialInfo> = {
    1: { id: 1, origen: 'COMPRADO', subBom: [] },
    2: {
      id: 2, origen: 'FABRICADO',
      subBom: [
        { materialId: 3, claseConsumo: 'FIJO', consumoFijo: 0.04, consumoPorTalla: {}, mermaPct: null }, // poliol
      ],
    },
    3: { id: 3, origen: 'COMPRADO', subBom: [] },
  };

  it('material comprado: nodo hoja sin hijos', () => {
    const lineas: LineaBase[] = [lineaFija(1, 0.1)];
    const arbol = explotarMultinivel(lineas, materiales, 42);
    expect(arbol).toEqual([{ materialId: 1, consumo: 0.1, origen: 'COMPRADO', hijos: [] }]);
  });

  it('material fabricado: explota su sub-BOM multiplicando por el consumo del padre', () => {
    const lineas: LineaBase[] = [lineaFija(2, 2)]; // 2 plantillas por par
    const arbol = explotarMultinivel(lineas, materiales, 42);
    expect(arbol[0].materialId).toBe(2);
    expect(arbol[0].consumo).toBe(2);
    expect(arbol[0].hijos).toHaveLength(1);
    expect(arbol[0].hijos[0]).toMatchObject({ materialId: 3, origen: 'COMPRADO' });
    expect(arbol[0].hijos[0].consumo).toBeCloseTo(0.08, 5); // 0.04 * 2
  });
});
