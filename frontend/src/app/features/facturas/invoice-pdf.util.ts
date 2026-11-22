import { Factura, FacturaLinea, LineaEmisor } from '../../core/api/models/pedidos.models';
import { deliveryLabel, partialDispatchLabel } from '../../shared/dispatch/dispatch-labels';

/**
 * Modelo de la factura impresa (PDF). Lógica pura, testeable sin DOM ni jsPDF:
 * el render vive en invoice-pdf.ts y sigue el formato de la proforma de la OC.
 *
 * Ojo: el modelo no tiene CUFE ni resolución de facturación DIAN, así que el PDF
 * es un documento interno y lo dice en el pie.
 */

export const INVOICE_FOOTER =
  'Documento interno de control. No reemplaza la factura electrónica de venta (DIAN).';

export interface InvoiceIssuer {
  nombre: string;
  razonSocial: string | null;
  nit: string | null;
}

export interface InvoiceCustomer {
  nombre: string;
  nit: string;
  direccion: string | null;
  ciudad: string | null;
  telefono: string | null;
}

export interface InvoicePdf {
  numero: string;
  tipo: 'PRODUCTO' | 'SERVICIO';
  titulo: string;
  fecha: Date;
  vencimiento: Date | null;
  anulada: boolean;
  emisor: InvoiceIssuer;
  cliente: InvoiceCustomer;
  /** "DSP-9 · OP-3 · OC-21"; null en la de servicio (no nace de un despacho). */
  referencia: string | null;
  /** "Entrega 2", "Entrega 3 (final)". */
  entrega: string | null;
  /** "Despacho parcial" si el despacho no cerró el pedido. */
  parcial: string | null;
  direccionEntrega: string | null;
  head: string[];
  /** Filas ya formateadas para la tabla; las columnas numéricas son las 3 últimas. */
  rows: string[][];
  totalUnidades: number;
  subtotal: number;
  ivaPct: number;
  iva: number;
  total: number;
  pie: string;
}

export function moneda(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

/**
 * Fecha impresa en hora de Colombia (UTC-5), sin importar la zona del navegador:
 * una factura de las 23:30 en Ibagué llega en UTC como el día siguiente.
 */
export function fechaColombia(d: Date): string {
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function num(v: string | number | null | undefined): number {
  return Number(v ?? 0);
}

function emisorDe(l: LineaEmisor | null | undefined): InvoiceIssuer {
  return {
    nombre: l?.nombre ?? 'Factura',
    razonSocial: l?.razonSocial ?? null,
    nit: l?.nit ?? null,
  };
}

function referenciaProducto(l: FacturaLinea): string {
  const nombre = l.productoConfigurado?.nombreComercial ?? `Producto ${l.productoConfiguradoId}`;
  return l.calidad === 'SEGUNDA' ? `${nombre} (segunda)` : nombre;
}

function conceptoServicio(l: FacturaLinea): string {
  const nombre = l.servicio?.nombre ?? 'Servicio';
  return l.descripcion ? `${nombre}: ${l.descripcion}` : nombre;
}

export function buildInvoicePdf(f: Factura): InvoicePdf {
  const servicio = f.tipo === 'SERVICIO' || !f.despacho;
  const d = f.despacho ?? null;
  const clienteOc = d?.op?.oc?.cliente;
  const c = f.cliente ?? clienteOc;
  const lineas = f.lineas ?? [];

  let head: string[];
  let rows: string[][];
  if (servicio) {
    head = ['Servicio', 'Unidad', 'Cant.', 'Precio', 'Subtotal'];
    rows = lineas.map((l) => [
      conceptoServicio(l),
      l.servicio?.unidad ?? '',
      l.cantidad.toLocaleString('es-CO'),
      moneda(num(l.precioUnitario)),
      moneda(num(l.subtotal)),
    ]);
  } else {
    // Por referencia y, dentro de cada una, por talla: así se lee contra el remito.
    const orden = [...lineas].sort((a, b) =>
      referenciaProducto(a).localeCompare(referenciaProducto(b), 'es') ||
      num(a.talla?.valor) - num(b.talla?.valor),
    );
    head = ['Referencia', 'Talla', 'Pares', 'Precio/par', 'Subtotal'];
    rows = orden.map((l) => [
      referenciaProducto(l),
      l.talla?.valor != null ? String(l.talla.valor) : '',
      l.cantidad.toLocaleString('es-CO'),
      moneda(num(l.precioUnitario)),
      moneda(num(l.subtotal)),
    ]);
  }

  return {
    numero: `FAC-${f.consecutivo}`,
    tipo: servicio ? 'SERVICIO' : 'PRODUCTO',
    titulo: servicio ? 'FACTURA DE SERVICIO' : 'FACTURA',
    fecha: new Date(f.fecha),
    vencimiento: f.fechaVencimiento ? new Date(f.fechaVencimiento) : null,
    anulada: f.estado === 'ANULADA',
    emisor: emisorDe(f.linea ?? d?.op?.linea),
    cliente: {
      nombre: c?.nombre ?? '',
      nit: c?.nit ?? '',
      direccion: c?.direccion ?? null,
      ciudad: c?.ciudad ?? null,
      telefono: c?.telefono ?? null,
    },
    referencia: d ? `DSP-${d.consecutivo} · OP-${d.op?.consecutivo} · OC-${d.op?.oc?.consecutivo}` : null,
    entrega: d ? deliveryLabel(d.deliveryNumber, d.isFinal) : null,
    parcial: d ? partialDispatchLabel(d.deliveryNumber, d.isFinal) : null,
    direccionEntrega: d?.direccionEntrega ?? null,
    head,
    rows,
    totalUnidades: lineas.reduce((acc, l) => acc + l.cantidad, 0),
    subtotal: num(f.subtotal),
    ivaPct: num(f.ivaPct),
    iva: num(f.iva),
    total: num(f.total),
    pie: INVOICE_FOOTER,
  };
}
