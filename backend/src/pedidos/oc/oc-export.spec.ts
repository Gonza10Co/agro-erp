import { aplanarPedidos, diaCalendario, diaColombia, OCParaExportar } from './oc-export';

const talla = (valor: number, cantidad: number) => ({ cantidad, talla: { valor, orden: valor } });

const oc = (over: Partial<OCParaExportar> = {}): OCParaExportar => ({
  consecutivo: 19,
  ocCliente: 'AGR-956',
  estado: 'EN_PRODUCCION',
  paraStock: false,
  // 02:00 UTC del 13 = 21:00 del 12 en Colombia.
  fecha: new Date('2026-11-13T02:00:00Z'),
  fechaConfirmacion: new Date('2026-11-13T15:00:00Z'),
  fechaEntrega: new Date('2026-11-30T00:00:00Z'),
  fechaPedidoCliente: new Date('2026-11-10T00:00:00Z'),
  observaciones: 'va en bolsa',
  cliente: { nit: '900123', nombre: 'CALZATODO SA' },
  sedeEntrega: { nombre: 'Principal', ciudad: 'Bogotá' },
  linea: { nombre: 'Basarili' },
  lineas: [
    {
      productoConfiguradoId: 5,
      calidad: 'PRIMERA',
      precioUnitario: '43000.00',
      productoConfigurado: { codigo: 'PC-5', nombreComercial: 'PODEROSA · Con puntera', referencia: { codigo: '101' }, marca: { nombre: 'PODEROSA' } },
      // Desordenadas a propósito: salen por el orden de la talla.
      tallas: [talla(42, 30), talla(40, 20)],
    },
    {
      productoConfiguradoId: 6,
      calidad: 'SEGUNDA',
      precioUnitario: null,
      productoConfigurado: { codigo: 'PC-6', nombreComercial: 'ALPACA', referencia: { codigo: '102' }, marca: { nombre: 'ALPACA' } },
      tallas: [talla(40, 10)],
    },
  ],
  ordenProduccion: {
    consecutivo: 1,
    estado: 'EN_PRODUCCION',
    lineas: [
      { productoConfiguradoId: 5, calidad: 'PRIMERA', tallas: [
        { cantAmarrada: 5, cantAProducir: 15, talla: { valor: 40 } },
        { cantAmarrada: 0, cantAProducir: 30, talla: { valor: 42 } },
      ] },
    ],
    // Dos despachos parciales de la misma OP: suman.
    despachos: [
      { lineas: [{ productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 3, talla: { valor: 40 } }] },
      { lineas: [{ productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 2, talla: { valor: 40 } }] },
    ],
  },
  ...over,
});

describe('oc-export', () => {
  it('pasa los instantes a día Colombia y los @db.Date sin correrse', () => {
    expect(diaColombia(new Date('2026-11-13T02:00:00Z'))).toBe('2026-11-12');
    expect(diaCalendario(new Date('2026-11-30T00:00:00Z'))).toBe('2026-11-30');
    expect(diaColombia(null)).toBeNull();
  });

  it('una fila por pedido × producto × talla, con amarre, despacho y valor', () => {
    const { tallas } = aplanarPedidos([oc()]);
    expect(tallas.map((t) => [t.codigo, t.talla, t.cantidad])).toEqual([
      ['PC-5', 40, 20], ['PC-5', 42, 30], ['PC-6', 40, 10],
    ]);
    expect(tallas[0]).toEqual(expect.objectContaining({
      consecutivo: 19, ocCliente: 'AGR-956', cliente: 'CALZATODO SA', nit: '900123', linea: 'Basarili',
      estado: 'EN_PRODUCCION', paraStock: false, referencia: '101', marca: 'PODEROSA',
      producto: 'PODEROSA · Con puntera', calidad: 'PRIMERA',
      deBodega: 5, aProducir: 15, despachados: 5, pendientes: 15,
      opConsecutivo: 1, opEstado: 'EN_PRODUCCION', precioUnitario: 43000, valor: 860000,
      fechaPedidoCliente: '2026-11-10', fechaSubida: '2026-11-12', fechaConfirmacion: '2026-11-13', fechaEntrega: '2026-11-30',
      observaciones: 'va en bolsa',
    }));
    // La segunda no está en la OP ni tiene precio: ceros y null, no se inventa.
    expect(tallas[2]).toEqual(expect.objectContaining({ calidad: 'SEGUNDA', deBodega: 0, aProducir: 0, despachados: 0, precioUnitario: null, valor: null }));
  });

  it('una fila por pedido con totales, referencias y marcas sin repetir', () => {
    const { pedidos } = aplanarPedidos([oc()]);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toEqual(expect.objectContaining({
      consecutivo: 19, sede: 'Principal', ciudadEntrega: 'Bogotá',
      referencias: '101, 102', marcas: 'PODEROSA, ALPACA', productos: 'PODEROSA · Con puntera, ALPACA',
      totalPares: 60, deBodega: 5, aProducir: 45, despachados: 5, pendientes: 55,
      valor: 43000 * 50, opConsecutivo: 1, opEstado: 'EN_PRODUCCION',
    }));
  });

  it('pedido sin OP ni precio: OP en null, cantidades en cero y valor null', () => {
    const { pedidos } = aplanarPedidos([oc({
      ordenProduccion: null, estado: 'BORRADOR', paraStock: true, fechaConfirmacion: null, fechaPedidoCliente: null,
      linea: null, sedeEntrega: null,
      lineas: [{ ...oc().lineas[1] }],
    })]);
    expect(pedidos[0]).toEqual(expect.objectContaining({
      estado: 'BORRADOR', paraStock: true, opConsecutivo: null, opEstado: null, linea: null, sede: null,
      fechaConfirmacion: null, fechaPedidoCliente: null, deBodega: 0, aProducir: 0, valor: null, totalPares: 10,
      entregas: 0,
    }));
  });

  it('una OP anulada no cuenta amarre ni lo que iba a producir, pero sí se nombra', () => {
    const base = oc();
    const { tallas } = aplanarPedidos([oc({ ordenProduccion: { ...base.ordenProduccion!, estado: 'ANULADA', despachos: [] } })]);
    expect(tallas[0]).toEqual(expect.objectContaining({ opConsecutivo: 1, opEstado: 'ANULADA', deBodega: 0, aProducir: 0 }));
  });

  it('despacho parcial: lo despachado suma todos los despachos y lo pendiente es el resto', () => {
    const base = oc();
    const { tallas, pedidos } = aplanarPedidos([oc({
      ordenProduccion: {
        ...base.ordenProduccion!,
        despachos: [
          { lineas: [{ productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 8, talla: { valor: 40 } }] },
          { lineas: [
            { productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 4, talla: { valor: 40 } },
            { productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 30, talla: { valor: 42 } },
          ] },
        ],
      },
    })]);
    expect(tallas[0]).toEqual(expect.objectContaining({ talla: 40, despachados: 12, pendientes: 8 }));
    expect(tallas[1]).toEqual(expect.objectContaining({ talla: 42, despachados: 30, pendientes: 0 }));
    // Número de entregas del pedido (JP 20-nov: cuántas veces se le ha despachado).
    expect(pedidos[0].entregas).toBe(2);
  });

  it('incluye los pedidos anulados (Power Query filtra)', () => {
    const { pedidos } = aplanarPedidos([oc(), oc({ consecutivo: 20, estado: 'ANULADA', ordenProduccion: null })]);
    expect(pedidos.map((p) => p.estado)).toEqual(['EN_PRODUCCION', 'ANULADA']);
  });
});
