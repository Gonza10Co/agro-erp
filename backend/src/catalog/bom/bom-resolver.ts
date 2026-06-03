import { LineaBase } from './bom-resolver.types';

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
