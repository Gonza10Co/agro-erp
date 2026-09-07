/**
 * Dónde está apuntando DATABASE_URL, para que los seeds destructivos no corran contra
 * producción por accidente (no existía ninguna guardia: bastaba descomentar la URL de
 * Railway en .env). Lógica pura, sin Prisma, para poder probarla.
 */

/** `host:puerto/base`, sin usuario ni clave — apto para imprimir en consola. */
export function describirBase(url = process.env.DATABASE_URL ?? ''): string {
  return url.replace(/^.*@/, '').replace(/\?.*$/, '') || '(DATABASE_URL vacía)';
}

/** Railway (prod) se reconoce por el host; NODE_ENV=production también cuenta. */
export function esBaseDeProduccion(
  url = process.env.DATABASE_URL ?? '',
  nodeEnv = process.env.NODE_ENV,
): boolean {
  const host = url.replace(/^.*@/, '').replace(/[:/?].*$/, '').toLowerCase();
  return /(^|\.)(rlwy\.net|railway\.app|railway\.internal)$/.test(host) || nodeEnv === 'production';
}

/**
 * Aborta si la base es producción. Para seeds que borran o pisan datos (seed:demo,
 * seed:catalogo): no tienen sentido en prod y no hay flag para forzarlos a propósito.
 */
export function exigirNoProd(nombreSeed: string): void {
  if (!esBaseDeProduccion()) return;
  console.error(
    `✖ ${nombreSeed} NO corre contra producción (${describirBase()}): borra o pisa datos reales.\n` +
      '  Si de verdad hace falta, apunta DATABASE_URL a una copia local (ver docs/AVANCE.md).',
  );
  process.exit(2);
}
