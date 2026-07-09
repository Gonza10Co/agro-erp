/**
 * Reglas del editor de BOM que no dependen de Angular.
 */

export interface LineaConIdentidad {
  materialId: number | null;
  piezaId: number | null;
}

/**
 * Antes una receta no admitía el mismo material dos veces. Con el despiece sí: la micropiel
 * puede ir en la capellada y en el talón con consumos distintos. Lo que no se repite es el
 * par (material, pieza) — dos líneas de "micropiel · lateral" no tendrían sentido.
 *
 * `idx` es la línea que se está editando (se ignora al comparar); null si es nueva.
 */
export function lineaDuplicada(
  lineas: LineaConIdentidad[],
  borrador: LineaConIdentidad,
  idx: number | null,
): boolean {
  return lineas.some(
    (l, i) =>
      i !== idx &&
      l.materialId === borrador.materialId &&
      (l.piezaId ?? null) === (borrador.piezaId ?? null),
  );
}

/** Mensaje para el usuario cuando la línea choca con otra. */
export function mensajeDuplicado(nombrePieza: string | null): string {
  return nombrePieza
    ? `Ese material ya está en el BOM para la pieza "${nombrePieza}"`
    : 'Ese material ya está en el BOM sin pieza (bota completa)';
}
