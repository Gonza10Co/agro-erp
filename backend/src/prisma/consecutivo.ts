// Numeración consecutiva atómica vía secuencias de PostgreSQL.
// Reemplaza el patrón `aggregate _max + 1`, que tiene carrera bajo concurrencia.
const SECUENCIAS = {
  oc: 'oc_consecutivo_seq',
  op: 'op_consecutivo_seq',
  of: 'of_consecutivo_seq',
  despacho: 'despacho_consecutivo_seq',
  req: 'req_consecutivo_seq',
  factura: 'factura_consecutivo_seq',
} as const;

export type EntidadConsecutivo = keyof typeof SECUENCIAS;

export interface ClienteConsecutivo {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

export async function siguienteConsecutivo(
  db: ClienteConsecutivo,
  entidad: EntidadConsecutivo,
): Promise<number> {
  // El nombre de la secuencia sale de un mapa cerrado: no hay inyección posible.
  const rows = await db.$queryRawUnsafe<Array<{ v: bigint }>>(
    `SELECT nextval('${SECUENCIAS[entidad]}') AS v`,
  );
  return Number(rows[0].v);
}
