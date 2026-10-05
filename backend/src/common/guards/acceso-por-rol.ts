/**
 * Roles ACOTADOS: perfiles de planta que solo deben tocar su pedazo del sistema.
 * Para ellos la regla es lista blanca (deny by default): lo que no esté acá da 403.
 * Los roles que no aparecen en el mapa (ADMIN, GERENTE, CLIENTE, STAGE, OPERARIO,
 * CALIDAD) no pasan por este filtro; siguen gobernados por `@Roles` donde lo haya.
 *
 * Vive en un solo lugar y se aplica dentro de `JwtAuthGuard`, que TODOS los
 * controladores protegidos ya usan: así un controlador nuevo queda cerrado para
 * el rol acotado sin acordarse de decorar nada.
 */

export interface ReglaAcceso {
  /** Métodos HTTP permitidos, o '*' para todos. */
  metodos: readonly string[] | '*';
  /** Ruta del handler (el patrón de Express, p. ej. `/corte/ordenes/:id`). */
  ruta: RegExp;
}

export const LISTA_BLANCA_ROL: Readonly<Record<string, readonly ReglaAcceso[]>> = {
  // Jefe de corte (2026-10-05): la orden de corte del día y sus avances. Nada de
  // precios, costos, cartera, clientes, facturas ni compras.
  JEFE_CORTE: [
    // Sesión: login (sin token) y `auth/me`.
    { metodos: '*', ruta: /^\/auth(\/|$)/ },
    // Todo el control de corte: tablero, órdenes, avances y cambios de estado.
    { metodos: '*', ruta: /^\/corte(\/|$)/ },
    // El filtro por línea del tablero de corte. Solo el listado, solo lectura.
    { metodos: ['GET'], ruta: /^\/catalog\/lineas\/?$/ },
  ],
};

/** ¿El rol tiene lista blanca? (o sea, ¿es un rol acotado?) */
export function esRolAcotado(rol: string | null | undefined): boolean {
  return !!rol && Object.prototype.hasOwnProperty.call(LISTA_BLANCA_ROL, rol);
}

/**
 * ¿El rol puede llamar este endpoint? Los roles sin lista blanca siempre pasan.
 * La ruta se compara sin query string y sin distinguir mayúsculas (Express
 * enruta `/CORTE` igual que `/corte`). Una ruta con `..` se niega de plano.
 */
export function rolPuedeLlamar(
  rol: string | null | undefined,
  metodo: string,
  ruta: string,
): boolean {
  if (!esRolAcotado(rol)) return true;
  const limpia = (ruta.split('?')[0] ?? '').toLowerCase();
  if (limpia.includes('..')) return false;
  const m = metodo.toUpperCase();
  return LISTA_BLANCA_ROL[rol as string].some(
    (r) => (r.metodos === '*' || r.metodos.includes(m)) && r.ruta.test(limpia),
  );
}
