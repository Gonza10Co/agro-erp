/**
 * Visibilidad de módulos por rol, con NIVELES DE LIBERACIÓN. Permite compartir un
 * mismo despliegue mostrando a cada perfil solo lo que le corresponde:
 *
 *   ENTREGADO  → lo aprobado por el cliente (demos ya entregadas)
 *   EN_STAGE   → la próxima entrega: se muestra al perfil STAGE en la demo,
 *                aún oculto al cliente. "Merge a cliente" = subir el módulo a
 *                ENTREGADO (una línea en NIVEL_MODULO).
 *   INTERNO    → adelantado; solo roles internos (ADMIN/GERENTE/…).
 *
 * Cada rol ve hasta su alcance: CLIENTE→ENTREGADO, STAGE→EN_STAGE, interno→INTERNO.
 * El gating es de interfaz: oculta menús y bloquea rutas; no reemplaza la
 * autorización del backend.
 */
export type Modulo =
  | 'inicio'
  | 'pedidos'
  | 'clientes'
  | 'proveedores'
  | 'catalogo'
  | 'maestros'
  | 'despachos'
  | 'facturas'
  | 'cartera'
  | 'compras'
  | 'inventario'
  | 'fabricacion'
  | 'calidad'
  | 'indicadores'
  | 'reportes';

/** Nivel de madurez de un módulo o sección (menor = más liberado al cliente). */
export type NivelLiberacion = 'ENTREGADO' | 'EN_STAGE' | 'INTERNO';

/** Escala de comparación: un rol ve algo si su alcance ≥ el nivel de lo que mira. */
const RANK: Record<NivelLiberacion, number> = { ENTREGADO: 0, EN_STAGE: 1, INTERNO: 2 };

/**
 * Nivel de liberación de cada módulo. Este mapa ES el tablero de la demo:
 * subir un módulo de EN_STAGE a ENTREGADO lo "mergea a cliente" tras aprobar la demo.
 */
const NIVEL_MODULO: Record<Modulo, NivelLiberacion> = {
  // ENTREGADO — visible al cliente (demos 1-2: pedidos + clientes + catálogo/BOM).
  clientes: 'ENTREGADO',
  pedidos: 'ENTREGADO',
  catalogo: 'ENTREGADO',
  // El cliente empieza a cargar sus datos maestros (referencias, materiales, marcas,
  // líneas, grupos de opción). Ninguna de esas pantallas muestra costos.
  maestros: 'ENTREGADO',
  // EN_STAGE — próxima entrega (Fase A): compras de insumos con costo. Se muestra
  // al perfil STAGE en la demo; el cliente aún no lo ve.
  compras: 'EN_STAGE',
  // INTERNO — adelantado, solo roles internos.
  inicio: 'INTERNO',
  proveedores: 'INTERNO',
  despachos: 'INTERNO',
  facturas: 'INTERNO',
  cartera: 'INTERNO',
  inventario: 'INTERNO',
  fabricacion: 'INTERNO',
  calidad: 'INTERNO',
  indicadores: 'INTERNO',
  reportes: 'INTERNO',
};

/**
 * Alcance de cada rol. Los roles no listados (ADMIN, GERENTE, OPERARIO, nulo o
 * desconocido) caen en INTERNO por defecto → ven todo (defensivo: no rompe a
 * usuarios internos).
 */
const ALCANCE_ROL: Record<string, NivelLiberacion> = {
  CLIENTE: 'ENTREGADO',
  STAGE: 'EN_STAGE',
};

function alcanceRol(rol: string | null | undefined): NivelLiberacion {
  return ALCANCE_ROL[rol ?? ''] ?? 'INTERNO';
}

/**
 * ¿El rol alcanza a ver contenido marcado con este nivel? Úsese para gatear
 * SECCIONES dentro de un módulo ya visible (p. ej. el bloque costo/utilidad
 * dentro de "pedidos", que el cliente no debe ver hasta liberarlo).
 */
export function puedeVerNivel(rol: string | null | undefined, nivel: NivelLiberacion): boolean {
  return RANK[alcanceRol(rol)] >= RANK[nivel];
}

/** ¿El rol puede ver el módulo completo? (menú + guard de ruta). */
export function puedeVerModulo(rol: string | null | undefined, modulo: Modulo): boolean {
  return puedeVerNivel(rol, NIVEL_MODULO[modulo]);
}

/** Ruta de aterrizaje según el rol (a dónde enviar si cae en una ruta no permitida). */
export function rutaInicial(rol: string | null | undefined): string {
  // Los internos aterrizan en el panel de inicio; cliente y stage, en la capa comercial.
  return puedeVerModulo(rol, 'inicio') ? '/inicio' : '/pedidos/oc';
}
