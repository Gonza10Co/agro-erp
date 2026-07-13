import { Talla, CrearOCDto } from '../../../core/api/models/pedidos.models';
import { ProductoConfiguradoFull } from '../../../core/api/models/catalogo.models';

export interface LineaWizard {
  producto: ProductoConfiguradoFull;
  precio: number;
  valores: Record<number, number>;
}

export function tallasDeProducto(producto: ProductoConfiguradoFull, todas: Talla[]): Talla[] {
  const min = producto.referencia.tallaMin.orden;
  const max = producto.referencia.tallaMax.orden;
  return todas.filter((t) => t.orden >= min && t.orden <= max);
}

/**
 * Al editar una OC, qué destino se le manda al backend.
 *
 * El backend da precedencia a la dirección escrita a mano sobre la sede principal, así que
 * reenviar el snapshot como texto soltaría la sede sin que nadie lo pidiera. Y a la inversa:
 * si la OC nunca tuvo sede (entrega puntual), no mandar nada la mudaría a la sede principal.
 */
export function destinoAlEditar(args: {
  sedeEntregaIdActual?: number | null;
  direccionOriginal?: string | null;
  direccionEditada: string;
}): { sedeEntregaId?: number; direccionDespacho?: string } {
  const editada = args.direccionEditada.trim();
  const intacta = editada === (args.direccionOriginal ?? '').trim();
  const conservaSede = intacta && args.sedeEntregaIdActual != null;

  return conservaSede
    ? { sedeEntregaId: args.sedeEntregaIdActual as number, direccionDespacho: undefined }
    : { sedeEntregaId: undefined, direccionDespacho: editada || undefined };
}

export function construirDto(args: {
  clienteId: number;
  ocCliente?: string;
  observaciones?: string;
  sedeEntregaId?: number | null;
  direccionDespacho?: string;
  lineaId?: number | null;
  lineas: LineaWizard[];
}): CrearOCDto {
  return {
    clienteId: args.clienteId,
    ocCliente: args.ocCliente ? args.ocCliente : undefined,
    observaciones: args.observaciones ? args.observaciones : undefined,
    // Sin sede no se manda la clave: el backend caerá en la sede principal del cliente.
    ...(args.sedeEntregaId != null ? { sedeEntregaId: args.sedeEntregaId } : {}),
    direccionDespacho: args.direccionDespacho ? args.direccionDespacho : undefined,
    // Línea de producción del pedido; sin elegir no se manda la clave.
    ...(args.lineaId != null ? { lineaId: args.lineaId } : {}),
    lineas: args.lineas.map((l) => ({
      productoConfiguradoId: l.producto.id,
      precioUnitario: l.precio > 0 ? l.precio : undefined,
      tallas: Object.entries(l.valores)
        .map(([tallaId, cantidad]) => ({ tallaId: Number(tallaId), cantidad }))
        .filter((t) => t.cantidad > 0),
    })),
  };
}
