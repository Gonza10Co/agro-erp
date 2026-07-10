/**
 * Lógica pura de sedes de cliente. Sin Prisma: se testea sin BD.
 */

export interface SedeBase {
  id: number;
  nombre: string;
  ciudad: string;
  direccion: string;
  esPrincipal: boolean;
  activo: boolean;
}

/**
 * Texto que se congela en la OC y viaja al remito. Es un snapshot: si mañana
 * corrigen la dirección de la sede, los despachos viejos conservan este texto.
 */
export function formatearDireccionEntrega(
  sede: Pick<SedeBase, 'direccion' | 'ciudad'>,
): string {
  const direccion = sede.direccion.trim();
  const ciudad = sede.ciudad.trim();
  return ciudad ? `${direccion}, ${ciudad}` : direccion;
}

/**
 * Destino por defecto de un pedido: la sede principal activa. Si el cliente no tiene
 * principal (datos viejos), cae en la primera activa. Sin sedes activas, no hay destino.
 */
export function elegirSedePorDefecto<T extends Pick<SedeBase, 'esPrincipal' | 'activo'>>(
  sedes: T[],
): T | null {
  const activas = sedes.filter((s) => s.activo);
  return activas.find((s) => s.esPrincipal) ?? activas[0] ?? null;
}

/**
 * La primera sede de un cliente siempre nace como principal: si no, quedaría un cliente
 * con sedes pero sin destino por defecto.
 */
export function debeNacerPrincipal(
  sedesExistentes: number,
  esPrincipalPedido: boolean | undefined,
): boolean {
  return sedesExistentes === 0 ? true : esPrincipalPedido === true;
}
