import { estimateDelivery } from './delivery-estimate';
import { EntradaProyeccion, PedidoEntrada, RenglonPedido } from './proyeccion-core';
import { CAPACIDAD_AGRO } from './capacidad-planta';

// Lunes a sábado, sin festivos (la planta SÍ trabaja sábados). 2026-11-12 es jueves.
const LUN_SAB = { diasSemana: [false, true, true, true, true, true, true], noHabiles: [] as string[] };

const renglones = (tallas: Record<number, number>, calidad = 'PRIMERA'): RenglonPedido[] =>
  Object.entries(tallas).map(([t, c]) => ({
    productoConfiguradoId: 16, producto: 'ALPACA', referencia: '102', marca: 'ALPACA',
    talla: Number(t), calidad, pedida: c,
  }));

const pedido = (ocId: number, tallas: Record<number, number>, over: Partial<PedidoEntrada> = {}): PedidoEntrada => ({
  ocId, consecutivo: ocId, cliente: `Cliente ${ocId}`, ocCliente: null,
  fechaBase: '2026-11-10', fechaEntrega: null, tieneOP: false, renglones: renglones(tallas), ...over,
});

// Un día de planta lleno: 1.206 pares repartidos sin pasar del molde de cada talla.
const DIA_LLENO = { 40: 300, 41: 300, 42: 300, 43: 306 };

const entrada = (pedidos: PedidoEntrada[], extra: Partial<EntradaProyeccion> = {}): EntradaProyeccion => ({
  hoy: '2026-11-12', calendario: LUN_SAB, capacidad: CAPACIDAD_AGRO, plazoDias: 15, pedidos, stock: [], ...extra,
});

describe('estimateDelivery: fecha sugerida para el pedido nuevo', () => {
  it('con la planta vacía se produce hoy y se promete hoy + 15 días', () => {
    const r = estimateDelivery(entrada([]), { renglones: renglones({ 40: 100 }) });
    expect(r).toMatchObject({
      queuePosition: 1, ordersAhead: 0, pairs: 100, toProduce: 100,
      productionStart: '2026-11-12', productionEnd: '2026-11-12',
      // 10 días hábiles de proceso (lunes a sábado) hasta producto terminado.
      readyDate: '2026-11-24',
      suggestedDate: '2026-11-27',
    });
    expect(r.explanation).toContain('sin pedidos por delante');
  });

  it('con la cola llena va detrás de todos, aunque ellos tengan fecha más lejana', () => {
    const r = estimateDelivery(
      entrada([
        pedido(1, DIA_LLENO),
        pedido(2, DIA_LLENO, { fechaEntrega: '2027-03-01' }),
      ]),
      { renglones: renglones({ 40: 100 }) },
    );
    // Los dos pedidos llenan jueves 12 y viernes 13: el nuevo arranca el sábado 14.
    expect(r.ordersAhead).toBe(2);
    expect(r.queuePosition).toBe(3);
    expect(r.productionStart).toBe('2026-11-14');
    expect(r.explanation).toContain('después de 2 pedidos en cola');
  });

  it('el sábado se produce, pero la promesa que cae en domingo pasa al lunes', () => {
    const r = estimateDelivery(entrada([], { hoy: '2026-11-14' }), { renglones: renglones({ 40: 100 }) });
    expect(r.productionStart).toBe('2026-11-14');
    // 14 nov + 15 = domingo 29 → lunes 30.
    expect(r.suggestedDate).toBe('2026-11-30');
  });

  it('con calendario de lunes a viernes el sábado no cuenta', () => {
    const LUN_VIE = { diasSemana: [false, true, true, true, true, true, false], noHabiles: [] };
    const r = estimateDelivery(entrada([], { hoy: '2026-11-14', calendario: LUN_VIE }), { renglones: renglones({ 40: 100 }) });
    expect(r.productionStart).toBe('2026-11-16');
    expect(r.suggestedDate).toBe('2026-12-01');
  });

  it('una cantidad grande ocupa varios días y se promete desde el último', () => {
    const r = estimateDelivery(entrada([]), { renglones: renglones({ 40: 750, 41: 750, 42: 750, 43: 750 }) });
    // 3.000 pares a 1.206 por día: jueves, viernes y sábado.
    expect(r.productionStart).toBe('2026-11-12');
    expect(r.productionEnd).toBe('2026-11-14');
    expect(r.suggestedDate).toBe('2026-11-30');
  });

  it('respeta el tope de los moldes: 300 pares de la 46 (un solo molde) toman 5 días', () => {
    const r = estimateDelivery(entrada([]), { renglones: renglones({ 46: 300 }) });
    // 70 pares por día: 12, 13, 14, 16 y 17 de noviembre.
    expect(r.productionEnd).toBe('2026-11-17');
    expect(r.suggestedDate).toBe('2026-12-02');
  });

  it('lo que hay en bodega no se produce; si alcanza, plazo estándar desde hoy', () => {
    const r = estimateDelivery(
      entrada([], { stock: [{ productoConfiguradoId: 16, talla: 40, calidad: 'PRIMERA', libre: 100 }] }),
      { renglones: renglones({ 40: 100 }) },
    );
    expect(r).toMatchObject({ fromStock: 100, toProduce: 0, productionStart: null, suggestedDate: '2026-11-27' });
    expect(r.explanation).toContain('Sale todo de bodega');
  });

  it('un pedido de mínimos no toma de la bodega', () => {
    const r = estimateDelivery(
      entrada([], { stock: [{ productoConfiguradoId: 16, talla: 40, calidad: 'PRIMERA', libre: 100 }] }),
      { paraStock: true, renglones: renglones({ 40: 100 }) },
    );
    expect(r.toProduce).toBe(100);
  });

  it('las segundas no ocupan planta', () => {
    const r = estimateDelivery(entrada([pedido(1, DIA_LLENO)]), { renglones: renglones({ 40: 100 }, 'SEGUNDA') });
    expect(r.toProduce).toBe(0);
  });

  it('los pedidos que salen de bodega no cuentan como cola', () => {
    const r = estimateDelivery(
      entrada([pedido(1, { 40: 50 })], { stock: [{ productoConfiguradoId: 16, talla: 40, calidad: 'PRIMERA', libre: 50 }] }),
      { renglones: renglones({ 41: 10 }) },
    );
    expect(r.ordersAhead).toBe(0);
    expect(r.queuePosition).toBe(1);
  });

  it('sin cupo en el horizonte no sugiere fecha', () => {
    const r = estimateDelivery(entrada([pedido(1, DIA_LLENO)], { horizonteDias: 1 }), { renglones: renglones({ 40: 100 }) });
    expect(r.suggestedDate).toBeNull();
    expect(r.noCapacity).toBe(100);
    expect(r.explanation).toContain('no tiene cupo');
  });
});
