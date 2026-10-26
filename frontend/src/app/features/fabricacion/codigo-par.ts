/**
 * Deja el código de un par tal como se guardó (`OF19-0021`). Es el mismo criterio del
 * backend (`normalizarCodigoPar` en fabricacion-core.ts): la pistola teclea según su
 * idioma de teclado y con el latino el guion puede llegar como `'` o `?`.
 */
export function normalizarCodigoPar(crudo: string): string {
  const limpio = (crudo ?? '').toUpperCase().replace(/\s+/g, '');
  const m = /^OF(\d+)[^A-Z0-9]+(\d+)$/.exec(limpio);
  if (!m) return limpio;
  return `OF${Number(m[1])}-${m[2].padStart(4, '0')}`;
}
