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
  // Tablet de estación (2026-11-04): el usuario con el que queda logueada cada tablet
  // de planta. Pistolea, nace pares en Preparación y mira el tablero y la TV. Nada de
  // crear OF, prender o apagar estaciones, consumo de materiales, inspección en PT,
  // precios, cartera, clientes ni compras.
  ESTACION: [
    // Sesión: login, `auth/me` y la renovación silenciosa (`auth/refresh`).
    { metodos: '*', ruta: /^\/auth(\/|$)/ },
    // El pistolazo y el detalle del par (sticker y reimpresión de la lengua).
    { metodos: ['POST'], ruta: /^\/fabricacion\/par\/[^/]+\/avanzar$/ },
    { metodos: ['GET'], ruta: /^\/fabricacion\/par\/[^/]+$/ },
    // Lo que carga la pantalla de estación: estaciones, operarios y máquinas de su célula.
    { metodos: ['GET'], ruta: /^\/fabricacion\/(estaciones|operarios|maquinas)\/?$/ },
    // TV de planta y tableros (por estación y por órdenes).
    { metodos: ['GET'], ruta: /^\/fabricacion\/(hoy|tablero|tablero-resumen|tablero-ordenes)\/?$/ },
    // Preparación: elige la OF, nace la tanda e imprime etiquetas por adelantado.
    { metodos: ['GET'], ruta: /^\/fabricacion\/of\/?$/ },
    { metodos: ['GET'], ruta: /^\/fabricacion\/of\/[^/]+$/ },
    { metodos: ['POST'], ruta: /^\/fabricacion\/of\/[^/]+\/(nacer|reservar-etiquetas)$/ },
    { metodos: ['GET'], ruta: /^\/fabricacion\/of\/[^/]+\/etiquetas-reservadas$/ },
    // "Algo pasó con este par": el catálogo tipificado de daños.
    { metodos: ['GET'], ruta: /^\/calidad\/tipos-dano\/?$/ },
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
