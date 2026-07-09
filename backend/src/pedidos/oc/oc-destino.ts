import { formatearDireccionEntrega } from '../../clientes/sedes-core';

export interface SedeParaDestino {
  id: number;
  ciudad: string;
  direccion: string;
}

export interface DestinoOC {
  sedeEntregaId: number | null;
  /** Snapshot: se congela al crear la OC y viaja al remito. No se relee de la sede. */
  direccionDespacho: string | null;
}

/**
 * A dónde va este pedido. Precedencia:
 *   1. la sede que el usuario eligió explícitamente,
 *   2. una dirección escrita a mano (entrega puntual: una obra, un evento),
 *   3. la sede principal del cliente.
 * Si el cliente no tiene sedes y nadie escribió nada, la OC queda sin destino.
 */
export function resolverDestinoOC(opts: {
  sedeElegida?: SedeParaDestino | null;
  sedePrincipal?: SedeParaDestino | null;
  direccionManual?: string | null;
}): DestinoOC {
  const { sedeElegida, sedePrincipal, direccionManual } = opts;

  if (sedeElegida)
    return {
      sedeEntregaId: sedeElegida.id,
      direccionDespacho: formatearDireccionEntrega(sedeElegida),
    };

  const manual = direccionManual?.trim();
  if (manual) return { sedeEntregaId: null, direccionDespacho: manual };

  if (sedePrincipal)
    return {
      sedeEntregaId: sedePrincipal.id,
      direccionDespacho: formatearDireccionEntrega(sedePrincipal),
    };

  return { sedeEntregaId: null, direccionDespacho: null };
}
