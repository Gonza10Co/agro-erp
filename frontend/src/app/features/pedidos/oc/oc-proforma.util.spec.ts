import { armarProforma, EmisorProforma, IVA_PROFORMA_PCT } from './oc-proforma.util';
import { OrdenCompra } from '../../../core/api/models/pedidos.models';

describe('armarProforma', () => {
  const emisor: EmisorProforma = {
    nombre: 'Feroz',
    razonSocial: 'INDUSTRIAS FEROZ SAS',
    nit: '902.072.014',
    datosPago: 'Bancolombia Ahorros 0000-000000-0 · INDUSTRIAS FEROZ SAS',
  };

  const oc = {
    id: 1,
    consecutivo: 9,
    clienteId: 7,
    cliente: { id: 7, nombre: 'CHANCLAS LA 16', nit: '6482148-0', telefono: '3174421834' },
    fecha: '2026-07-10T08:00:00.000Z',
    estado: 'BORRADOR',
    direccionDespacho: 'CALLE 16 #8-41, Pereira',
    lineas: [
      {
        id: 1,
        productoConfiguradoId: 2,
        productoConfigurado: { id: 2, codigo: 'PC-701', nombreComercial: 'Bota dotación Ref. 701' },
        precioUnitario: '40900',
        tallas: [
          { id: 1, tallaId: 1, cantidad: 8, talla: { id: 1, valor: 38, orden: 1 } },
          { id: 2, tallaId: 2, cantidad: 25, talla: { id: 2, valor: 39, orden: 2 } },
        ],
      },
      {
        id: 2,
        productoConfiguradoId: 3,
        productoConfigurado: { id: 3, codigo: 'PC-702', nombreComercial: 'Bota Ref. 702' },
        precioUnitario: '50000',
        tallas: [{ id: 3, tallaId: 2, cantidad: 10, talla: { id: 2, valor: 39, orden: 2 } }],
      },
    ],
  } as unknown as OrdenCompra;

  const ahora = new Date(2026, 6, 10, 7, 53, 53); // 10-jul-2026 07:53:53 local

  it('numera la cotización con fecha y hora', () => {
    const p = armarProforma(oc, emisor, ahora);
    expect(p.numero).toBe('COT-20260710-075353');
  });

  it('arma una línea por producto con pares, precio y subtotal', () => {
    const p = armarProforma(oc, emisor, ahora);
    expect(p.lineas).toEqual([
      { concepto: 'Bota dotación Ref. 701', pares: 33, precioPar: 40900, subtotal: 1349700 },
      { concepto: 'Bota Ref. 702', pares: 10, precioPar: 50000, subtotal: 500000 },
    ]);
  });

  it('agrega la curva de tallas entre líneas, ordenada por talla', () => {
    const p = armarProforma(oc, emisor, ahora);
    expect(p.tallas).toEqual([
      { valor: 38, cantidad: 8 },
      { valor: 39, cantidad: 35 },
    ]);
  });

  it('calcula subtotal, IVA 19% y total', () => {
    const p = armarProforma(oc, emisor, ahora);
    expect(p.subtotal).toBe(1849700);
    expect(p.ivaPct).toBe(IVA_PROFORMA_PCT);
    expect(p.iva).toBeCloseTo(1849700 * 0.19, 5);
    expect(p.total).toBeCloseTo(1849700 * 1.19, 5);
  });

  it('una línea sin precio pactado va en $0 y no daña los totales', () => {
    const sinPrecio = {
      ...oc,
      lineas: [{ ...(oc.lineas![0] as any), precioUnitario: null }],
    } as OrdenCompra;
    const p = armarProforma(sinPrecio, emisor, ahora);
    expect(p.lineas[0].precioPar).toBe(0);
    expect(p.subtotal).toBe(0);
    expect(p.total).toBe(0);
  });

  it('lleva los datos del cliente y la entrega', () => {
    const p = armarProforma(oc, emisor, ahora);
    expect(p.clienteNombre).toBe('CHANCLAS LA 16');
    expect(p.clienteNit).toBe('6482148-0');
    expect(p.clienteTel).toBe('3174421834');
    expect(p.entrega).toBe('CALLE 16 #8-41, Pereira');
    expect(p.emisor).toBe(emisor);
  });
});
