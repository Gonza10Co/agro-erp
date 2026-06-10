import { calcularTramos, agruparPorEtapa, agruparPorOperario, agruparPorMaquina, detectarDemoras } from './indicadores-core';

describe('calcularTramos', () => {
  it('duración = evento − anterior (createdAt para el primero), en minutos', () => {
    const createdAt = new Date('2026-06-10T08:00:00Z');
    const eventos = [
      { celula: 'CORTE', subPaso: null, operarioId: 1, operario: { nombre: 'A' }, maquinaId: 1, maquina: { nombre: 'M1' }, timestamp: new Date('2026-06-10T08:20:00Z') },
      { celula: 'GUARNICION', subPaso: 'AREA', operarioId: 2, operario: { nombre: 'B' }, maquinaId: 2, maquina: { nombre: 'M2' }, timestamp: new Date('2026-06-10T08:35:00Z') },
    ];
    const tramos = calcularTramos(createdAt, eventos as any);
    expect(tramos).toHaveLength(2);
    expect(tramos[0]).toMatchObject({ celula: 'CORTE', subPaso: null, operarioId: 1, operarioNombre: 'A', maquinaId: 1, maquinaNombre: 'M1', duracionMin: 20 });
    expect(tramos[1]).toMatchObject({ celula: 'GUARNICION', subPaso: 'AREA', operarioId: 2, duracionMin: 15 });
  });
  it('par sin eventos → sin tramos', () => {
    expect(calcularTramos(new Date(), [])).toEqual([]);
  });
  it('clampa a 0 si el createdAt es posterior al primer evento (skew)', () => {
    const createdAt = new Date('2026-06-10T09:00:00Z');
    const eventos = [{ celula: 'CORTE', subPaso: null, operarioId: 1, operario: { nombre: 'A' }, maquinaId: 1, maquina: { nombre: 'M1' }, timestamp: new Date('2026-06-10T08:00:00Z') }];
    expect(calcularTramos(createdAt, eventos as any)[0].duracionMin).toBe(0);
  });
});

describe('agrupaciones', () => {
  const tramos = [
    { celula: 'CORTE', subPaso: null, operarioId: 1, operarioNombre: 'A', maquinaId: 1, maquinaNombre: 'M1', duracionMin: 10 },
    { celula: 'CORTE', subPaso: null, operarioId: 1, operarioNombre: 'A', maquinaId: 1, maquinaNombre: 'M1', duracionMin: 20 },
    { celula: 'GUARNICION', subPaso: 'AREA', operarioId: 2, operarioNombre: 'B', maquinaId: 2, maquinaNombre: 'M2', duracionMin: 6 },
  ];
  it('porEtapa: promedio y conteo por (celula, subPaso)', () => {
    const r = agruparPorEtapa(tramos as any);
    expect(r.find((e) => e.celula === 'CORTE' && e.subPaso === null)).toMatchObject({ tramos: 2, promedioMin: 15 });
    expect(r.find((e) => e.subPaso === 'AREA')).toMatchObject({ tramos: 1, promedioMin: 6 });
  });
  it('porOperario / porMaquina: promedio + conteo, ordenado por # tramos desc', () => {
    expect(agruparPorOperario(tramos as any)[0]).toMatchObject({ operarioId: 1, nombre: 'A', tramos: 2, promedioMin: 15 });
    expect(agruparPorMaquina(tramos as any)[0]).toMatchObject({ maquinaId: 1, nombre: 'M1', tramos: 2, promedioMin: 15 });
  });
});

describe('detectarDemoras', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  const umbrales = { CORTE: 30, GUARNICION: 20, ALMACEN: 30, INYECCION: 45, PT: 30 };
  it('marca demorado el par que excede el umbral de su célula actual, ordenado por exceso', () => {
    const pares = [
      { codigo: 'P1', celulaActual: 'GUARNICION', subPasoActual: 'STROBEL', desde: new Date('2026-06-10T11:00:00Z') }, // 60 > 20
      { codigo: 'P2', celulaActual: 'CORTE', subPasoActual: null, desde: new Date('2026-06-10T11:50:00Z') }, // 10 < 30
    ];
    const al = detectarDemoras(pares as any, umbrales as any, now);
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ codigo: 'P1', celula: 'GUARNICION', subPaso: 'STROBEL', minutosEnEtapa: 60, umbralMin: 20 });
  });
  it('sin umbral para la célula → no alerta', () => {
    const al = detectarDemoras([{ codigo: 'X', celulaActual: 'PT', subPasoActual: null, desde: new Date('2026-06-10T08:00:00Z') }] as any, {} as any, now);
    expect(al).toEqual([]);
  });
});
