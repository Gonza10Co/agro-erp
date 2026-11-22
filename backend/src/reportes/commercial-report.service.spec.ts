import { CommercialReportService, OrderRow, ordersToFacts } from './commercial-report.service';
import { defaultRange, parseIds } from './commercial-report.controller';

const pc = (refId: number, brandId: number, brandLine: { id: number; nombre: string } | null = null) => ({
  referencia: { id: refId, codigo: String(refId), nombreInterno: String(refId) },
  marca: { id: brandId, nombre: `M${brandId}`, linea: brandLine },
});

const order = (p: Partial<OrderRow>): OrderRow => ({
  id: 1, estado: 'CONFIRMADA', paraStock: false, fecha: new Date('2026-10-10T15:00:00Z'), fechaPedidoCliente: null,
  clienteId: 7, cliente: { nombre: 'Vozincol' }, linea: { id: 1, nombre: 'Basarili' },
  lineas: [], ordenProduccion: null, ...p,
});

describe('CommercialReportService', () => {
  it('ordersToFacts: pares por talla, valor con precio, despacho casado por producto y calidad', () => {
    const facts = ordersToFacts([
      order({
        lineas: [
          { productoConfiguradoId: 5, calidad: 'PRIMERA', precioUnitario: '50000.00', tallas: [{ cantidad: 10 }, { cantidad: 20 }], productoConfigurado: pc(101, 3) },
          { productoConfiguradoId: 5, calidad: 'SEGUNDA', precioUnitario: null, tallas: [{ cantidad: 4 }], productoConfigurado: pc(101, 3) },
        ],
        ordenProduccion: {
          despachos: [
            { lineas: [{ productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 12 }] },
            { lineas: [{ productoConfiguradoId: 5, calidad: 'PRIMERA', cantidad: 3 }, { productoConfiguradoId: 5, calidad: 'SEGUNDA', cantidad: 4 }] },
          ],
        },
      }),
    ]);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({ forStock: false, month: '2026-10', pairs: 30, dispatched: 15, value: 1_500_000, unpricedPairs: 0, lineName: 'Basarili' });
    expect(facts[1]).toMatchObject({ pairs: 4, dispatched: 4, value: 0, unpricedPairs: 4 });
  });

  it('ordersToFacts: sin línea en la OC cae a la de la marca, y si no "Sin línea"', () => {
    const facts = ordersToFacts([
      order({ linea: null, lineas: [{ productoConfiguradoId: 1, calidad: 'PRIMERA', precioUnitario: null, tallas: [{ cantidad: 1 }], productoConfigurado: pc(101, 3, { id: 4, nombre: 'Feroz' }) }] }),
      order({ id: 2, linea: null, lineas: [{ productoConfiguradoId: 1, calidad: 'PRIMERA', precioUnitario: null, tallas: [{ cantidad: 1 }], productoConfigurado: pc(101, 3) }] }),
    ]);
    expect(facts.map((f) => [f.lineId, f.lineName])).toEqual([[4, 'Feroz'], [null, 'Sin línea']]);
  });

  it('report consulta por rango (día del cliente o subida en hora Colombia) y agrega', async () => {
    const prisma: any = {
      ordenCompra: {
        findMany: jest.fn().mockResolvedValue([
          order({ lineas: [{ productoConfiguradoId: 1, calidad: 'PRIMERA', precioUnitario: 10, tallas: [{ cantidad: 5 }], productoConfigurado: pc(101, 3) }] }),
        ]),
      },
    };
    const r = await new CommercialReportService(prisma).report({ from: '2026-10-01', to: '2026-10-31', rows: 'client', filters: {} });
    const where = prisma.ordenCompra.findMany.mock.calls[0][0].where;
    expect(where.OR[0].fechaPedidoCliente.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(where.OR[1].fecha.gte.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(where.OR[1].fecha.lt.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(r.kpis).toMatchObject({ orders: 1, pairs: 5, value: 50 });
    expect(r.pivot.rows[0].label).toBe('Vozincol');
  });

  it('parseIds y defaultRange', () => {
    expect(parseIds('1, 2,x,0')).toEqual([1, 2, 0]);
    expect(parseIds('')).toBeUndefined();
    expect(defaultRange(new Date('2026-11-21T15:00:00Z'))).toEqual({ from: '2025-12-01', to: '2026-11-21' });
  });
});
