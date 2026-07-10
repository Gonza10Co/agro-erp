import { OCLinea, OrdenCompra } from '../../../core/api/models/pedidos.models';

/**
 * Modelo de la cotización/proforma que se imprime desde una OC en BORRADOR.
 * Lógica pura (testeable sin DOM ni PDF): el render vive en oc-proforma-pdf.ts.
 */

/** IVA de la proforma. Los precios pactados de la OC son SIN IVA. */
export const IVA_PROFORMA_PCT = 19;

/** Datos de la empresa que emite: salen de la Linea (razonSocial/nit/datosPago). */
export interface EmisorProforma {
  nombre: string;
  razonSocial: string;
  nit: string;
  datosPago: string;
}

export interface ProformaLinea {
  concepto: string;
  pares: number;
  precioPar: number;
  subtotal: number;
}

export interface ProformaTalla {
  valor: number;
  cantidad: number;
}

export interface Proforma {
  numero: string;
  fecha: Date;
  emisor: EmisorProforma;
  clienteNombre: string;
  clienteNit: string;
  clienteTel: string | null;
  entrega: string | null;
  lineas: ProformaLinea[];
  tallas: ProformaTalla[];
  subtotal: number;
  ivaPct: number;
  iva: number;
  total: number;
}

/** COT-YYYYMMDD-HHMMSS: identifica la impresión, no consume consecutivo de OC. */
function numeroCot(ahora: Date): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  const fecha = `${ahora.getFullYear()}${p2(ahora.getMonth() + 1)}${p2(ahora.getDate())}`;
  const hora = `${p2(ahora.getHours())}${p2(ahora.getMinutes())}${p2(ahora.getSeconds())}`;
  return `COT-${fecha}-${hora}`;
}

function paresDeLinea(l: OCLinea): number {
  return l.tallas.reduce((acc, t) => acc + t.cantidad, 0);
}

export function armarProforma(oc: OrdenCompra, emisor: EmisorProforma, ahora: Date): Proforma {
  const lineas: ProformaLinea[] = (oc.lineas ?? []).map((l) => {
    const pares = paresDeLinea(l);
    const precioPar = Number(l.precioUnitario ?? 0);
    return {
      concepto: l.productoConfigurado?.nombreComercial ?? `Producto ${l.productoConfiguradoId}`,
      pares,
      precioPar,
      subtotal: pares * precioPar,
    };
  });

  // Curva agregada entre líneas: al cliente final le importa cuántos pares por talla.
  const porTalla = new Map<number, number>();
  for (const l of oc.lineas ?? []) {
    for (const t of l.tallas) {
      const valor = t.talla?.valor ?? 0;
      porTalla.set(valor, (porTalla.get(valor) ?? 0) + t.cantidad);
    }
  }
  const tallas: ProformaTalla[] = [...porTalla.entries()]
    .map(([valor, cantidad]) => ({ valor, cantidad }))
    .sort((a, b) => a.valor - b.valor);

  const subtotal = lineas.reduce((acc, l) => acc + l.subtotal, 0);
  const iva = (subtotal * IVA_PROFORMA_PCT) / 100;

  return {
    numero: numeroCot(ahora),
    fecha: ahora,
    emisor,
    clienteNombre: oc.cliente?.nombre ?? '',
    clienteNit: oc.cliente?.nit ?? '',
    clienteTel: oc.cliente?.telefono ?? null,
    entrega: oc.direccionDespacho ?? null,
    lineas,
    tallas,
    subtotal,
    ivaPct: IVA_PROFORMA_PCT,
    iva,
    total: subtotal + iva,
  };
}
