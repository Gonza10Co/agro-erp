import { costoParDesdeComprados, resumenCosteo } from './oc-costeo';

describe('costoParDesdeComprados', () => {
  it('suma consumo × costo de cada insumo', () => {
    const comprados = [
      { materialId: 1, consumo: 2 },
      { materialId: 2, consumo: 0.5 },
    ];
    const costo = (id: number) => (({ 1: 100, 2: 400 }) as Record<number, number>)[id] ?? 0;
    expect(costoParDesdeComprados(comprados, costo)).toBe(2 * 100 + 0.5 * 400); // 400
  });

  it('un material sin costo aporta 0 (costeo parcial, no rompe)', () => {
    expect(costoParDesdeComprados([{ materialId: 9, consumo: 5 }], () => 0)).toBe(0);
  });
});

describe('resumenCosteo', () => {
  it('calcula venta, costo, utilidad y margen', () => {
    const r = resumenCosteo([
      { cantidad: 10, precioUnitario: 100, costoPar: 60 },
      { cantidad: 5, precioUnitario: 200, costoPar: 120 },
    ]);
    // venta 2000, costo 1200, utilidad 800, margen 40%
    expect(r).toEqual({ totalVenta: 2000, costoTotal: 1200, utilidad: 800, margenPct: 40 });
  });

  it('margen 0 si no hay venta (evita dividir por 0)', () => {
    expect(resumenCosteo([{ cantidad: 0, precioUnitario: 0, costoPar: 0 }]).margenPct).toBe(0);
  });

  it('utilidad negativa si el costo supera la venta', () => {
    const r = resumenCosteo([{ cantidad: 1, precioUnitario: 50, costoPar: 80 }]);
    expect(r.utilidad).toBe(-30);
    expect(r.margenPct).toBeCloseTo(-60);
  });
});
