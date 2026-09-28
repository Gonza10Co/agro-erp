// Lógica pura de materiales por talla (sin Prisma).
//
// Algunos insumos existen uno POR TALLA: "PLANTILLA PU TALLA 34", "… TALLA 35", etc.
// El BOM tiene UNA línea con uno de ellos (p. ej. la talla 40) y consumo por talla; al
// resolver para la talla T hay que descontar la plantilla T, no la 40. Los hermanos se
// reconocen por `familiaTalla` (misma familia) y se distinguen por su talla.
import { LineaBase, MaterialInfo } from './bom-resolver.types';

/** Prefijo alfabético del código (PPLA223 → "PPLA", MRP-017 → "MRP"). */
export function prefijoAlfabetico(codigo: string): string {
  return (codigo.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
}

const compararCodigo = (a: string, b: string): number =>
  a.localeCompare(b, 'es', { numeric: true });

/**
 * Material que corresponde a `talla` para el material de una línea. Si el material no
 * tiene familia, o no hay hermano ACTIVO de esa talla, devuelve el original.
 * Con varios candidatos (familias duplicadas con otro código, PPLA vs MRP-) gana el que
 * comparte el prefijo alfabético del original; si ninguno, el de menor código.
 */
export function materialParaTalla(
  materialId: number,
  talla: number,
  materiales: Record<number, MaterialInfo>,
): number {
  const original = materiales[materialId]?.familiaTalla;
  if (!original) return materialId;

  const candidatos = Object.values(materiales).filter(
    (m) =>
      m.familiaTalla != null &&
      m.familiaTalla.activo &&
      m.familiaTalla.familia === original.familia &&
      m.familiaTalla.tallaValor === talla,
  );
  if (!candidatos.length) return materialId;

  const prefijo = prefijoAlfabetico(original.codigo);
  const mismoPrefijo = candidatos.filter(
    (m) => prefijoAlfabetico(m.familiaTalla!.codigo) === prefijo,
  );
  const pool = mismoPrefijo.length ? mismoPrefijo : candidatos;
  pool.sort((a, b) => compararCodigo(a.familiaTalla!.codigo, b.familiaTalla!.codigo));
  return pool[0].id;
}

/**
 * Cambia el material de cada línea con familia-talla por el de la talla pedida. El
 * consumo (fijo o curva) es el de la línea: solo cambia QUÉ se descuenta, no cuánto.
 */
export function sustituirPorTalla(
  lineas: LineaBase[],
  talla: number,
  materiales: Record<number, MaterialInfo>,
): LineaBase[] {
  return lineas.map((linea) => {
    const nuevo = materialParaTalla(linea.materialId, talla, materiales);
    return nuevo === linea.materialId ? linea : { ...linea, materialId: nuevo };
  });
}
