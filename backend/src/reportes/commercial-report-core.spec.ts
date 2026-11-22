import { CommercialFact, buildCommercialReport, filterFacts, monthRange, orderMonth } from './commercial-report-core';

const fact = (p: Partial<CommercialFact>): CommercialFact => ({
  orderId: 1, month: '2026-10', status: 'CONFIRMADA',
  clientId: 1, clientName: 'Alfa', brandId: 10, brandName: 'AGRO',
  referenceId: 101, referenceName: '101', lineId: 1, lineName: 'Basarili',
  pairs: 0, dispatched: 0, value: 0, unpricedPairs: 0, ...p,
});

describe('commercial-report-core', () => {
  it('monthRange cruza el año', () => {
    expect(monthRange('2026-11-15', '2027-02-01')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('orderMonth usa el día del cliente y si no la subida en hora Colombia', () => {
    expect(orderMonth(new Date('2026-09-30T00:00:00Z'), new Date('2026-10-05T12:00:00Z'))).toBe('2026-09');
    // 1-nov 02:00 UTC = 31-oct 21:00 en Colombia
    expect(orderMonth(null, new Date('2026-11-01T02:00:00Z'))).toBe('2026-10');
  });

  it('sin filtro de estado deja fuera las anuladas; con filtro respeta la lista', () => {
    const fs = [fact({ status: 'ANULADA' }), fact({ status: 'BORRADOR', orderId: 2 })];
    expect(filterFacts(fs, {}).map((f) => f.orderId)).toEqual([2]);
    expect(filterFacts(fs, { statuses: ['ANULADA'] }).map((f) => f.status)).toEqual(['ANULADA']);
  });

  it('el filtro de línea usa 0 para "sin línea"', () => {
    const fs = [fact({ lineId: null, lineName: 'Sin línea' }), fact({ orderId: 2, lineId: 3 })];
    expect(filterFacts(fs, { lineIds: [0] }).map((f) => f.orderId)).toEqual([1]);
  });

  it('agrega KPIs, meses, top y pivot contando pedidos distintos', () => {
    const facts = [
      // Pedido 1 (Alfa, oct): dos marcas
      fact({ orderId: 1, brandId: 10, brandName: 'AGRO', pairs: 100, dispatched: 40, value: 1_000_000 }),
      fact({ orderId: 1, brandId: 11, brandName: 'ABRUZZO', referenceId: 102, referenceName: '102', pairs: 50, unpricedPairs: 50 }),
      // Pedido 2 (Beta, nov)
      fact({ orderId: 2, month: '2026-11', clientId: 2, clientName: 'Beta', pairs: 300, dispatched: 300, value: 2_500_000 }),
      // Pedido 3 fuera del rango
      fact({ orderId: 3, month: '2026-08', pairs: 999 }),
      // Anulado: no cuenta
      fact({ orderId: 4, status: 'ANULADA', pairs: 77 }),
    ];
    const r = buildCommercialReport(facts, { from: '2026-10-01', to: '2026-12-31', rows: 'brand', filters: {} });

    expect(r.months).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(r.kpis).toEqual({ orders: 2, pairs: 450, dispatched: 340, value: 3_500_000, pending: 110, unpricedPairs: 50, clients: 2 });
    expect(r.byMonth.map((m) => [m.month, m.orders, m.pairs])).toEqual([['2026-10', 1, 150], ['2026-11', 1, 300], ['2026-12', 0, 0]]);

    // Pivot por marca: AGRO tiene los pedidos 1 y 2 (2 pedidos), ABRUZZO solo el 1.
    expect(r.pivot.rows.map((x) => [x.label, x.total.orders, x.total.pairs])).toEqual([['AGRO', 2, 400], ['ABRUZZO', 1, 50]]);
    expect(r.pivot.rows[0].cells['2026-12']).toEqual({ orders: 0, pairs: 0, dispatched: 0, value: 0 });
    // El total por mes no duplica el pedido 1 aunque esté en dos filas.
    expect(r.pivot.totals.cells['2026-10'].orders).toBe(1);
    expect(r.pivot.totals.total.orders).toBe(2);

    expect(r.topClients.map((c) => c.label)).toEqual(['Beta', 'Alfa']);
    expect(r.topReferences[0]).toMatchObject({ label: '101', pairs: 400 });
  });

  it('las opciones salen del rango sin los otros filtros', () => {
    const facts = [fact({ clientId: 1, clientName: 'Alfa' }), fact({ orderId: 2, clientId: 2, clientName: 'Beta' })];
    const r = buildCommercialReport(facts, { from: '2026-10-01', to: '2026-10-31', rows: 'client', filters: { clientIds: [2] } });
    expect(r.kpis.orders).toBe(1);
    expect(r.options.clients.map((c) => c.label)).toEqual(['Alfa', 'Beta']);
  });
});
