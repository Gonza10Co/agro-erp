import { BadRequestException } from '@nestjs/common';
import { ESTACIONES_PILOTO } from './fabricacion-core';
import { bogotaDate, bogotaDayRange, productionByDay, StationEntry } from './production-by-day-core';
import { FabricacionService } from './fabricacion.service';

const DAY = bogotaDayRange('2026-11-21')!;
const LATER = new Date('2026-11-25T15:00:00Z');

function entry(over: Partial<StationEntry> = {}): StationEntry {
  return {
    parId: 1, station: 'PREPARACION', timestamp: new Date('2026-11-21T14:00:00Z'), inferred: false,
    ofId: 10, ofNumber: 21, productId: 5, product: 'Bota 101', sizeId: 3, size: 40, sizeOrder: 3, ...over,
  };
}
const run = (e: StationEntry[], now = LATER) => productionByDay(e, ESTACIONES_PILOTO, DAY, now);
const station = (e: StationEntry[], code: string, now = LATER) => run(e, now).find((s) => s.code === code);

describe('bogotaDayRange', () => {
  it('va de medianoche a medianoche de Bogotá (05:00 UTC)', () => {
    expect(DAY.start.toISOString()).toBe('2026-11-21T05:00:00.000Z');
    expect(DAY.end.toISOString()).toBe('2026-11-22T05:00:00.000Z');
    expect(bogotaDayRange('2026-12-31')!.end.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });

  it('rechaza formato malo y fechas que no existen', () => {
    for (const d of ['', 'ayer', '21-11-2026', '2026-11-1', '2026-02-30', '2026-13-01', '2027-02-29', '0000-01-01', '2026-11-21T00:00:00Z', ['2026-11-21'], null, undefined]) {
      expect(bogotaDayRange(d)).toBeNull();
    }
    expect(bogotaDayRange('2028-02-29')).not.toBeNull();
  });

  it('a las 11 pm de Bogotá hoy sigue siendo hoy, aunque en UTC ya sea mañana', () => {
    expect(bogotaDate(new Date('2026-11-22T04:59:59Z'))).toBe('2026-11-21');
    expect(bogotaDate(new Date('2026-11-22T05:00:00Z'))).toBe('2026-11-22');
  });
});

describe('productionByDay', () => {
  it('respeta la medianoche de Bogotá por los dos lados', () => {
    const at = ['2026-11-21T04:59:59.999Z', '2026-11-21T05:00:00.000Z', '2026-11-22T04:59:59.999Z', '2026-11-22T05:00:00.000Z'];
    const s = station(at.map((t, i) => entry({ parId: i, timestamp: new Date(t) })), 'PREPARACION')!;
    expect(s.pairs).toBe(2);
    expect(s.firstAt).toBe(at[1]);
    expect(s.lastAt).toBe(at[2]);
  });

  it('cuenta pares distintos: el mismo par dos veces en la estación vale uno', () => {
    const s = station([entry(), entry({ timestamp: new Date('2026-11-21T16:00:00Z') })], 'PREPARACION')!;
    expect(s.pairs).toBe(1);
    expect(s.orders[0].sizes[0].pairs).toBe(1);
    expect(s.lastAt).toBe('2026-11-21T16:00:00.000Z');
  });

  it('inferidos: suman al total y van aparte; si el par también tuvo pistolazo no es inferido', () => {
    const s = station([
      entry({ parId: 1 }),
      entry({ parId: 2, inferred: true, timestamp: new Date('2026-11-21T23:00:00Z') }),
      entry({ parId: 3, inferred: true }),
      entry({ parId: 3 }),
    ], 'PREPARACION')!;
    expect(s).toMatchObject({ pairs: 3, inferred: 1 });
    // La hora es de pistolazos reales.
    expect(s.lastAt).toBe('2026-11-21T14:00:00.000Z');
  });

  it('el par cuenta en cada estación a la que entró; CERRADO no es estación', () => {
    const r = run([entry(), entry({ station: 'BODEGA_CORTE' }), entry({ station: 'CERRADO' }), entry({ station: null })]);
    expect(r.map((s) => [s.code, s.pairs])).toEqual([
      ['PREPARACION', 1], ['BODEGA_CORTE', 1], ['MONTAJE', 0], ['FINIZAJE', 0], ['PT', 0],
    ]);
  });

  it('la estación apagada sale solo si ese día registró', () => {
    expect(station([entry()], 'CIERRE')).toBeUndefined();
    expect(station([entry({ station: 'CIERRE' })], 'CIERRE')).toMatchObject({ pairs: 1, active: false });
    // Apagada y con registros de OTRO día: tampoco sale.
    expect(station([entry({ station: 'CIERRE', timestamp: new Date('2026-11-20T14:00:00Z') })], 'CIERRE')).toBeUndefined();
  });

  it('un día sin registros devuelve las activas en cero', () => {
    const r = run([]);
    expect(r).toHaveLength(5);
    for (const s of r) expect(s).toMatchObject({ pairs: 0, inferred: 0, firstAt: null, lastAt: null, orders: [] });
  });

  it('como la TV, no cuenta eventos posteriores a ahora', () => {
    expect(station([entry()], 'PREPARACION', new Date('2026-11-21T13:59:00Z'))!.pairs).toBe(0);
  });

  it('desglosa por OF, producto y talla en el orden del catálogo, y cuadra con el total', () => {
    const s = station([
      entry({ parId: 1, sizeId: 9, size: 42, sizeOrder: 9 }),
      entry({ parId: 2 }),
      entry({ parId: 3 }),
      entry({ parId: 4, productId: 6, product: 'Azul 102' }),
      entry({ parId: 5, ofId: 11, ofNumber: 20 }),
    ], 'PREPARACION')!;
    expect(s.orders.map((o) => [o.ofNumber, o.product, o.pairs])).toEqual([[20, 'Bota 101', 1], [21, 'Azul 102', 1], [21, 'Bota 101', 3]]);
    expect(s.orders[2].sizes.map((t) => [t.size, t.pairs])).toEqual([[40, 2], [42, 1]]);
    expect(s.orders.reduce((n, o) => n + o.pairs, 0)).toBe(s.pairs);
  });
});

describe('FabricacionService.productionByDay', () => {
  function make(events: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(events);
    const prisma = { estacion: { findMany: jest.fn().mockResolvedValue(ESTACIONES_PILOTO) }, eventoTrazabilidad: { findMany } };
    return { findMany, service: new FabricacionService(prisma as never, {} as never, {} as never) };
  }
  afterEach(() => jest.useRealTimers());

  it('consulta el día pedido y arma la respuesta', async () => {
    const { service, findMany } = make([{
      parId: 1, estacionDestino: 'BODEGA_CORTE', timestamp: new Date('2026-06-20T14:00:00Z'), inferido: false,
      par: { of: { id: 10, consecutivo: 21 }, productoConfigurado: { id: 5, nombreComercial: 'Bota 101' }, talla: { id: 3, valor: 40, orden: 3 } },
    }]);
    jest.useFakeTimers({ now: LATER });
    const r = await service.productionByDay('2026-06-20');
    expect(findMany.mock.calls[0][0].where.timestamp).toEqual({
      gte: new Date('2026-06-20T05:00:00Z'), lt: new Date('2026-06-21T05:00:00Z'),
    });
    expect(r).toMatchObject({ date: '2026-06-20', today: '2026-11-25' });
    expect(r.stations.find((s) => s.code === 'BODEGA_CORTE')).toMatchObject({ pairs: 1, orders: [{ ofNumber: 21, sizes: [{ size: 40 }] }] });
  });

  it('sin fecha usa hoy de Bogotá, no el de UTC', async () => {
    const { service, findMany } = make();
    jest.useFakeTimers({ now: new Date('2026-11-22T03:00:00Z') }); // 10 pm del 21 en Bogotá
    const r = await service.productionByDay();
    expect(r.date).toBe('2026-11-21');
    expect(findMany.mock.calls[0][0].where.timestamp.gte).toEqual(new Date('2026-11-21T05:00:00Z'));
  });

  it('fecha inválida da 400 y no consulta la base', async () => {
    const { service, findMany } = make();
    for (const d of ['2026-02-30', 'x', '']) {
      await expect(service.productionByDay(d)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(findMany).not.toHaveBeenCalled();
  });
});
