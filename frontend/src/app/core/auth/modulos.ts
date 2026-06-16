/**
 * Visibilidad de módulos por rol. Permite compartir un mismo despliegue con el
 * cliente mostrándole solo un subconjunto (demos 1-2), mientras los roles
 * internos (ADMIN/GERENTE) ven todo. El gating es de interfaz: oculta menús y
 * bloquea rutas; no reemplaza la autorización del backend.
 */
export type Modulo =
  | 'inicio'
  | 'pedidos'
  | 'clientes'
  | 'catalogo'
  | 'despachos'
  | 'facturas'
  | 'cartera'
  | 'compras'
  | 'inventario'
  | 'fabricacion'
  | 'calidad'
  | 'indicadores'
  | 'reportes';

/** Módulos que ve el rol CLIENTE (demos 1-2: pedidos + clientes + catálogo/BOM). */
const MODULOS_CLIENTE: ReadonlySet<Modulo> = new Set<Modulo>(['clientes', 'pedidos', 'catalogo']);

/** Un rol restringido ve solo su subconjunto; cualquier otro rol ve todo. */
export function puedeVerModulo(rol: string | null | undefined, modulo: Modulo): boolean {
  if (rol === 'CLIENTE') return MODULOS_CLIENTE.has(modulo);
  return true;
}

/** Ruta de aterrizaje según el rol (a dónde enviar si cae en una ruta no permitida). */
export function rutaInicial(rol: string | null | undefined): string {
  return rol === 'CLIENTE' ? '/pedidos/oc' : '/inicio';
}
