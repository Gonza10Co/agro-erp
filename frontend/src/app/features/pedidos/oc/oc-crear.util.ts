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

export function construirDto(args: {
  clienteId: number;
  ocCliente?: string;
  observaciones?: string;
  lineas: LineaWizard[];
}): CrearOCDto {
  return {
    clienteId: args.clienteId,
    ocCliente: args.ocCliente ? args.ocCliente : undefined,
    observaciones: args.observaciones ? args.observaciones : undefined,
    lineas: args.lineas.map((l) => ({
      productoConfiguradoId: l.producto.id,
      precioUnitario: l.precio > 0 ? l.precio : undefined,
      tallas: Object.entries(l.valores)
        .map(([tallaId, cantidad]) => ({ tallaId: Number(tallaId), cantidad }))
        .filter((t) => t.cantidad > 0),
    })),
  };
}
