import { buildInvoicePdf, INVOICE_FOOTER } from './invoice-pdf.util';
import { renderInvoicePdf, resolvePdfLibs } from './invoice-pdf';
import { Factura } from '../../core/api/models/pedidos.models';

const emisor = { codigo: 'BASARILI', nombre: 'Basarili', razonSocial: 'BOTAS AGROINDUSTRIAL SAS', nit: '900.123.456-7', datosPago: 'x' };

function producto(extra: Partial<Factura['despacho']> = {}): Factura {
  return {
    id: 1, consecutivo: 57, despachoId: 9, tipo: 'PRODUCTO', estado: 'EMITIDA',
    fecha: '2026-11-20T15:00:00.000Z', fechaVencimiento: '2026-12-20T15:00:00.000Z',
    subtotal: '2350000', ivaPct: '19', iva: '446500', total: '2796500',
    cliente: { id: 5, nombre: 'CALZATODO SA', nit: '890.300.123-4', direccion: 'Cra 5 # 10-20', ciudad: 'Ibagué', telefono: '3001234567' },
    linea: null,
    despacho: {
      consecutivo: 9, deliveryNumber: 2, isFinal: false, direccionEntrega: 'Bodega Mariquita',
      op: { consecutivo: 3, linea: emisor, oc: { consecutivo: 21 } },
      ...extra,
    },
    lineas: [
      { id: 2, productoConfiguradoId: 7, productoConfigurado: { nombreComercial: 'Bota Ref. 102' } as any, tallaId: 40, talla: { valor: 40 } as any, cantidad: 10, precioUnitario: '85000', subtotal: '850000' },
      { id: 1, productoConfiguradoId: 7, productoConfigurado: { nombreComercial: 'Bota Ref. 102' } as any, tallaId: 39, talla: { valor: 39 } as any, cantidad: 1000, precioUnitario: '1000', subtotal: '1000000' },
      { id: 3, productoConfiguradoId: 7, productoConfigurado: { nombreComercial: 'Bota Ref. 102' } as any, tallaId: 41, talla: { valor: 41 } as any, calidad: 'SEGUNDA', cantidad: 10, precioUnitario: '50000', subtotal: '500000' },
    ],
  } as Factura;
}

describe('buildInvoicePdf', () => {
  it('arma encabezado, emisor de la línea de la OP y cliente', () => {
    const p = buildInvoicePdf(producto());
    expect(p.numero).toBe('FAC-57');
    expect(p.titulo).toBe('FACTURA');
    expect(p.emisor).toEqual({ nombre: 'Basarili', razonSocial: 'BOTAS AGROINDUSTRIAL SAS', nit: '900.123.456-7' });
    expect(p.cliente).toEqual({ nombre: 'CALZATODO SA', nit: '890.300.123-4', direccion: 'Cra 5 # 10-20', ciudad: 'Ibagué', telefono: '3001234567' });
    expect(p.referencia).toBe('DSP-9 · OP-3 · OC-21');
    expect(p.direccionEntrega).toBe('Bodega Mariquita');
    expect(p.vencimiento).toEqual(new Date('2026-12-20T15:00:00.000Z'));
  });

  it('una entrega intermedia sale con su número y "Despacho parcial"', () => {
    const p = buildInvoicePdf(producto());
    expect(p.entrega).toBe('Entrega 2');
    expect(p.parcial).toBe('Despacho parcial');
  });

  it('la entrega final dice "(final)" y no es parcial', () => {
    const p = buildInvoicePdf(producto({ deliveryNumber: 3, isFinal: true }));
    expect(p.entrega).toBe('Entrega 3 (final)');
    expect(p.parcial).toBeNull();
  });

  it('filas por referencia y talla ordenadas, con la segunda marcada y montos en pesos', () => {
    const p = buildInvoicePdf(producto());
    expect(p.head).toEqual(['Referencia', 'Talla', 'Pares', 'Precio/par', 'Subtotal']);
    expect(p.rows).toEqual([
      ['Bota Ref. 102', '39', (1000).toLocaleString('es-CO'), '$' + (1000).toLocaleString('es-CO'), '$' + (1000000).toLocaleString('es-CO')],
      ['Bota Ref. 102', '40', '10', '$' + (85000).toLocaleString('es-CO'), '$' + (850000).toLocaleString('es-CO')],
      ['Bota Ref. 102 (segunda)', '41', '10', '$' + (50000).toLocaleString('es-CO'), '$' + (500000).toLocaleString('es-CO')],
    ]);
    expect(p.totalUnidades).toBe(1020);
  });

  it('totales e IVA salen de la factura, y el pie avisa que es documento interno', () => {
    const p = buildInvoicePdf(producto());
    expect([p.subtotal, p.ivaPct, p.iva, p.total]).toEqual([2350000, 19, 446500, 2796500]);
    expect(p.pie).toBe(INVOICE_FOOTER);
    expect(p.pie).toContain('No reemplaza la factura electrónica');
    expect(p.anulada).toBeFalse();
  });

  it('ningún texto del PDF lleva rayas largas', () => {
    const p = buildInvoicePdf(producto());
    const textos = [p.titulo, p.referencia, p.entrega, p.parcial, p.pie, ...p.head, ...p.rows.flat()].join(' ');
    expect(/[\u2013\u2014]/.test(textos)).toBeFalse();
  });

  it('factura de servicio (maquila Feroz): sin despacho, emisor de la factura y columnas de servicio', () => {
    const f = {
      id: 2, consecutivo: 14, despachoId: null as any, tipo: 'SERVICIO', estado: 'ANULADA',
      fecha: '2026-08-04T12:00:00.000Z', fechaVencimiento: null,
      subtotal: '1000000', ivaPct: '19', iva: '190000', total: '1190000',
      cliente: { id: 9, nombre: 'CAPELLADAS BOGOTÁ', nit: '901.000.000-1' },
      linea: { codigo: 'FEROZ', nombre: 'Feroz', razonSocial: 'INDUSTRIAS FEROZ SAS', nit: '902.072.014' },
      despacho: null,
      lineas: [
        { id: 1, productoConfiguradoId: null as any, tallaId: null as any, servicio: { codigo: 'INY', nombre: 'Inyección de suela', unidad: 'PAR' }, descripcion: 'julio 2026', cantidad: 1000, precioUnitario: '1000', subtotal: '1000000' },
      ],
    } as unknown as Factura;
    const p = buildInvoicePdf(f);
    expect(p.tipo).toBe('SERVICIO');
    expect(p.titulo).toBe('FACTURA DE SERVICIO');
    expect(p.emisor.razonSocial).toBe('INDUSTRIAS FEROZ SAS');
    expect(p.referencia).toBeNull();
    expect(p.entrega).toBeNull();
    expect(p.parcial).toBeNull();
    expect(p.head).toEqual(['Servicio', 'Unidad', 'Cant.', 'Precio', 'Subtotal']);
    expect(p.rows[0].slice(0, 3)).toEqual(['Inyección de suela: julio 2026', 'PAR', (1000).toLocaleString('es-CO')]);
    expect(p.anulada).toBeTrue();
  });

  it('sin cliente en la factura cae al de la OC y sin datos de emisor no inventa NIT', () => {
    const f = producto();
    delete (f as any).cliente;
    f.despacho!.op.oc.cliente = { id: 5, nombre: 'Minera El Roble', nit: '900.111.222-3' } as any;
    f.despacho!.op.linea = null;
    const p = buildInvoicePdf(f);
    expect(p.cliente.nombre).toBe('Minera El Roble');
    expect(p.emisor).toEqual({ nombre: 'Factura', razonSocial: null, nit: null });
  });
});

describe('resolvePdfLibs', () => {
  class Doc {}
  const auto = () => undefined;

  it('acepta los exports nombrados (dev y tests)', () => {
    const r = resolvePdfLibs({ jsPDF: Doc }, { default: auto });
    expect(r.jsPDF).toBe(Doc as any);
    expect(r.autoTable).toBe(auto);
  });

  it('acepta el chunk de prod que solo trae default', () => {
    const r = resolvePdfLibs({ default: { jsPDF: Doc } }, { default: { default: auto } });
    expect(r.jsPDF).toBe(Doc as any);
    expect(r.autoTable).toBe(auto);
  });

  it('falla claro si no hay generador', () => {
    expect(() => resolvePdfLibs({}, {})).toThrowError('no se pudo cargar el generador de PDF');
  });
});

describe('renderInvoicePdf', () => {
  it('el PDF lleva la factura, la entrega, el despacho parcial y el pie interno', async () => {
    const doc = await renderInvoicePdf(buildInvoicePdf(producto()));
    const pdf: string = doc.output();
    for (const t of ['FAC-57', 'Entrega 2', 'Despacho parcial', 'Bota Ref. 102', 'TOTAL', 'No reemplaza la factura']) {
      expect(pdf).toContain(t);
    }
  });

  it('la de servicio anulada se renderiza con su título y la marca ANULADA', async () => {
    const anulada = { ...producto(), estado: 'ANULADA', tipo: 'SERVICIO', despacho: null } as Factura;
    const pdf: string = (await renderInvoicePdf(buildInvoicePdf(anulada))).output();
    expect(pdf).toContain('FACTURA DE SERVICIO');
    expect(pdf).toContain('ANULADA');
    expect(pdf).not.toContain('Despacho parcial');
  });
});
