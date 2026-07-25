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
  // Entregado en la demo de la Entrega 2 (2026-07-17): compras de insumos con
  // costo, recepciones parciales y devoluciones a proveedor.
  compras: 'ENTREGADO',
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
 * Secciones gateadas DENTRO de un módulo ya visible. Existen porque el nivel de
 * módulo no alcanza: lo nuevo aterriza en módulos que el cliente ya tiene
 * (pedidos, compras) y quedaría a la vista apenas se despliega.
 */
export type Seccion =
  // Entrega 2 — ya liberadas al cliente (se dejan acá como tablero histórico).
  | 'costo-utilidad-oc'
  | 'proforma-oc'
  // Entrega 3 — línea de producción por pedido.
  | 'linea-pedido'
  // Entrega 4 — amarre de insumos y secundarios de compras.
  | 'amarre-insumos'
  | 'recalcular-requerimiento'
  | 'operar-produccion'
  | 'ocp-manual'
  | 'ocp-anular'
  | 'costo-ocp';

/**
 * ESTE MAPA ES EL TABLERO DE LA DEMO. El día que se muestra una entrega, sus
 * secciones pasan de EN_STAGE a ENTREGADO acá — una línea por sección, sin
 * perseguir gates dispersos por los componentes.
 */
export const NIVEL_SECCION: Record<Seccion, NivelLiberacion> = {
  // Liberadas en la demo de la Entrega 2 (2026-07-17).
  'costo-utilidad-oc': 'ENTREGADO',
  'proforma-oc': 'ENTREGADO',
  // Entrega 3 (desplegada 2026-07-13) — se muestra en la demo, es el titular.
  'linea-pedido': 'EN_STAGE',
  // Entrega 4 — liberada al cliente el 2026-07-25, sin esperar a la demo: el amarre
  // de insumos ya le corría al generar la OP (el backend reserva su stock), así que
  // ocultarle el resultado le escondía por qué se movía su bodega.
  'amarre-insumos': 'ENTREGADO',
  'recalcular-requerimiento': 'ENTREGADO',
  'ocp-manual': 'ENTREGADO',
  'ocp-anular': 'ENTREGADO',
  'costo-ocp': 'ENTREGADO',
  // Piso de planta: NO va con compras. "Generar OF" y "Despachar" escriben hacia
  // módulos INTERNOS (fabricacion, despachos) que el cliente no puede abrir.
  'operar-produccion': 'EN_STAGE',
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

/**
 * ¿El rol alcanza a ver esta sección? Es el gate que deben usar las secciones
 * nuevas: el nivel vive en NIVEL_SECCION, no regado por los componentes.
 */
export function puedeVerSeccion(rol: string | null | undefined, seccion: Seccion): boolean {
  return puedeVerNivel(rol, NIVEL_SECCION[seccion]);
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
