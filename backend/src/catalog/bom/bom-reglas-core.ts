// Lógica pura de selección de reglas de override (sin Prisma).

/** Lo mínimo de una fila de ReglaOverride para decidir precedencias. */
export interface ReglaAlcance {
  referenciaId: number | null;
  marcaId: number | null;
  materialObjetivoId: number | null;
}

/**
 * Materiales propios de la marca: una regla GLOBAL (referenciaId NULL) aplica a todas las
 * referencias, pero si la referencia tiene su propia regla de esa marca para el mismo
 * material objetivo, la específica gana y la global se descarta (no se aplican las dos).
 * Se asume que todas las reglas recibidas ya son de la misma selección (misma marca).
 */
export function descartarGlobalesPisadas<T extends ReglaAlcance>(reglas: T[]): T[] {
  const pisados = new Set<number>();
  for (const r of reglas)
    if (r.referenciaId != null && r.marcaId != null && r.materialObjetivoId != null)
      pisados.add(r.materialObjetivoId);
  return reglas.filter(
    (r) =>
      r.referenciaId != null ||
      r.materialObjetivoId == null ||
      !pisados.has(r.materialObjetivoId),
  );
}
