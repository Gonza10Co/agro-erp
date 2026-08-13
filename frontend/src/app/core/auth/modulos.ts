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
  | 'reportes'
  | 'administracion';

/** Nivel de madurez de un módulo o sección (menor = más liberado al cliente). */
export type NivelLiberacion = 'ENTREGADO' | 'EN_STAGE' | 'INTERNO';

/** Escala de comparación: un rol ve algo si su alcance ≥ el nivel de lo que mira. */
const RANK: Record<NivelLiberacion, number> = { ENTREGADO: 0, EN_STAGE: 1, INTERNO: 2 };

/**
 * Nivel de liberación de cada módulo. Este mapa ES el tablero de la demo:
 * subir un módulo de EN_STAGE a ENTREGADO lo "mergea a cliente" tras aprobar la demo.
 *
 * El 2026-08-12 el mapa quedó TODO en ENTREGADO — el cliente ve el sistema completo.
 * Desde el 2026-08-13 vuelve a haber un módulo en EN_STAGE (`administracion`): es la
 * próxima entrega, que como siempre nace oculta al cliente.
 */
export const NIVEL_MODULO: Record<Modulo, NivelLiberacion> = {
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
  // Liberados al cliente el 2026-08-08, tras demostrarse las Entregas 5 y 6.
  // `facturas` es la puerta de la factura de servicio (maquila Feroz); `fabricacion`
  // guarda la pantalla del almacenista (consumo real de MP) y los sub-pasos de
  // inyección; `reportes`, la meta diaria contra días hábiles y las metas por célula.
  // Ninguno enlaza hacia módulos que sigan INTERNO, así que no deja botones muertos.
  facturas: 'ENTREGADO',
  fabricacion: 'ENTREGADO',
  reportes: 'ENTREGADO',
  // Liberados al cliente el 2026-08-12: el sistema entero queda a la vista. La razón
  // no fue que estuvieran "listos" (lo estaban hace demos), sino que mantenerlos
  // INTERNOS ya le abría huecos a lo que SÍ tenía: veía la factura sin el despacho
  // que la origina, pedía segundas sin poder consultar el saldo, y la regla de
  // cartera le bloqueaba un despacho que no podía ir a mirar. Ocultar la mitad de un
  // ciclo cerrado confunde más que mostrarlo completo.
  despachos: 'ENTREGADO',
  cartera: 'ENTREGADO',
  inventario: 'ENTREGADO',
  proveedores: 'ENTREGADO',
  calidad: 'ENTREGADO',
  indicadores: 'ENTREGADO',
  inicio: 'ENTREGADO',
  // EN_STAGE — la próxima entrega, aún oculta al cliente. Administración de
  // usuarios (accesos al sistema) y operarios (gente de planta). Nace acá por
  // la regla de siempre: solo sube a ENTREGADO el día que se muestra.
  administracion: 'EN_STAGE',
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
  | 'costo-ocp'
  // Entrega 5 — facturación de servicios (maquila Feroz) y venta de segundas.
  | 'factura-servicio'
  | 'venta-segundas';

/**
 * ESTE MAPA ES EL TABLERO DE LA DEMO. El día que se muestra una entrega, sus
 * secciones pasan de EN_STAGE a ENTREGADO acá — una línea por sección, sin
 * perseguir gates dispersos por los componentes.
 */
export const NIVEL_SECCION: Record<Seccion, NivelLiberacion> = {
  // Liberadas en la demo de la Entrega 2 (2026-07-17).
  'costo-utilidad-oc': 'ENTREGADO',
  'proforma-oc': 'ENTREGADO',
  // Entrega 3 — liberada en la demo del 2026-07-31. El cliente elige la línea de
  // producción al crear la OC. Requiere al menos una `Linea` con activo=true en la
  // base, o el wizard le bloquea el paso 1 (la línea es obligatoria para quien la ve).
  'linea-pedido': 'ENTREGADO',
  // Entrega 4 — liberada al cliente el 2026-07-25, sin esperar a la demo: el amarre
  // de insumos ya le corría al generar la OP (el backend reserva su stock), así que
  // ocultarle el resultado le escondía por qué se movía su bodega.
  'amarre-insumos': 'ENTREGADO',
  'recalcular-requerimiento': 'ENTREGADO',
  'ocp-manual': 'ENTREGADO',
  'ocp-anular': 'ENTREGADO',
  'costo-ocp': 'ENTREGADO',
  // Piso de planta — liberada el 2026-08-12, el día que se liberó `despachos` (era
  // justo la condición que la retenía: "Despachar" escribe hacia allá y antes dejaba
  // un botón que no llevaba a ninguna parte). ⚠️ Deja de ser consulta: el cliente
  // genera OFs y despacha de verdad. El gate era solo de UI — el backend nunca
  // bloqueó estos endpoints, así que lo que cambia es quién ve el botón, no qué
  // permite el servidor.
  'operar-produccion': 'ENTREGADO',
  // Entrega 5 — liberada al cliente el 2026-08-08, junto con su módulo `facturas`
  // (el módulo manda sobre la sección: había que bajar ambos, no solo uno).
  'factura-servicio': 'ENTREGADO',
  // Entrega 5 — liberada en la demo del 2026-07-31. Cae dentro de `pedidos`, que el
  // cliente ya tiene. Desde el 2026-08-12 ya puede consultar el saldo de segundas
  // antes de pedirlas (`inventario` se liberó); la nota del wizard sigue avisando
  // que lo que no alcance no se fabrica — las segundas salen de un defecto, no de
  // una orden.
  'venta-segundas': 'ENTREGADO',
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
  // Desde el 2026-08-12 `inicio` es ENTREGADO, así que TODOS aterrizan en el panel.
  // Antes cliente y stage caían en la capa comercial (/pedidos/oc) porque el
  // dashboard enlazaba a módulos que no podían abrir; ya no queda ninguno.
  return puedeVerModulo(rol, 'inicio') ? '/inicio' : '/pedidos/oc';
}
