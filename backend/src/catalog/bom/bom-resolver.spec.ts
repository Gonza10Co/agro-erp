import { resolverConsumoTalla } from './bom-resolver';
import { LineaBase } from './bom-resolver.types';

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
