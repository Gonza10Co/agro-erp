import {
  consolidarConsumos,
  fechaDeJornada,
  rangoDeJornadas,
  ORDEN_ESTADOS_CORTE,
  siguienteEstadoCorte,
  esTransicionValida,
  selloDeEstado,
  indicadoresDeOrden,
  alertasDeOrden,
  lineasDesdeProgramacion,
  UMBRALES_CORTE_DEFAULT,
} from './orden-corte-core';

describe('máquina de estados de la orden de corte', () => {
  it('avanza en el orden físico del proceso', () => {
    expect(siguienteEstadoCorte('PROGRAMADA')).toBe('EN_CORTE');
    expect(siguienteEstadoCorte('EN_CORTE')).toBe('ENTREGADA');
    expect(siguienteEstadoCorte('ENTREGADA')).toBe('EN_GUARNICION');
    expect(siguienteEstadoCorte('EN_GUARNICION')).toBe('CERRADA');
  });

  it('CERRADA es el final del recorrido', () => {
    expect(siguienteEstadoCorte('CERRADA')).toBeNull();
  });

  it('ANULADA no avanza: sale del flujo', () => {
    expect(siguienteEstadoCorte('ANULADA')).toBeNull();
  });

  it('es forward-only: no se puede devolver una orden', () => {
    expect(esTransicionValida('ENTREGADA', 'EN_CORTE')).toBe(false);
    expect(esTransicionValida('EN_CORTE', 'ENTREGADA')).toBe(true);
  });

  it('no permite saltarse etapas', () => {
    expect(esTransicionValida('PROGRAMADA', 'ENTREGADA')).toBe(false);
  });

  it('se puede anular desde cualquier estado vivo, pero no una ya cerrada', () => {
    expect(esTransicionValida('PROGRAMADA', 'ANULADA')).toBe(true);
    expect(esTransicionValida('EN_CORTE', 'ANULADA')).toBe(true);
    expect(esTransicionValida('CERRADA', 'ANULADA')).toBe(false);
  });

  it('el orden declarado no tiene huecos ni repetidos', () => {
    expect(new Set(ORDEN_ESTADOS_CORTE).size).toBe(ORDEN_ESTADOS_CORTE.length);
  });
});

describe('sello de fecha por estado (los cuatro toques)', () => {
  it('cada estado sella su propio campo', () => {
    expect(selloDeEstado('EN_CORTE')).toBe('inicioCorte');
    expect(selloDeEstado('ENTREGADA')).toBe('entregaCorte');
    expect(selloDeEstado('EN_GUARNICION')).toBe('inicioGuarnicion');
    expect(selloDeEstado('CERRADA')).toBe('cierreGuarnicion');
  });

  it('PROGRAMADA y ANULADA no sellan nada', () => {
    expect(selloDeEstado('PROGRAMADA')).toBeNull();
    expect(selloDeEstado('ANULADA')).toBeNull();
  });
});

describe('indicadores de la orden', () => {
  const orden = {
    lineas: [
      { cantProgramada: 600, cantCortada: 580, cantAmarrada: 560 },
      { cantProgramada: 606, cantCortada: 606, cantAmarrada: 600 },
    ],
    avances: [
      { piezasCortadas: 14000, piezasDanadas: 120, piezasRepuestas: 100 },
      { piezasCortadas: 15000, piezasDanadas: 80, piezasRepuestas: 80 },
    ],
    inicioCorte: new Date('2026-08-19T07:00:00Z'),
    entregaCorte: new Date('2026-08-20T16:00:00Z'),
    inicioGuarnicion: new Date('2026-08-21T07:00:00Z'),
    cierreGuarnicion: new Date('2026-08-24T07:00:00Z'),
  };

  it('suma los totales programado, cortado y amarrado', () => {
    const i = indicadoresDeOrden(orden);
    expect(i.programado).toBe(1206);
    expect(i.cortado).toBe(1186);
    expect(i.amarrado).toBe(1160);
  });

  it('cumplimiento de corte = cortado / programado', () => {
    expect(indicadoresDeOrden(orden).cumplimiento).toBeCloseTo(1186 / 1206, 5);
  });

  it('índice de reposición = repuestas / cortadas — el que pidió Gabriel', () => {
    expect(indicadoresDeOrden(orden).indiceReposicion).toBeCloseTo(180 / 29000, 6);
  });

  it('rendimiento de guarnición = amarrado / cortado', () => {
    expect(indicadoresDeOrden(orden).rendimientoGuarnicion).toBeCloseTo(1160 / 1186, 5);
  });

  it('el WIP en piso sale por diferencia, no por conteo de pares', () => {
    expect(indicadoresDeOrden(orden).wip).toBe(1186 - 1160);
  });

  it('mide los ciclos en horas entre los toques', () => {
    const i = indicadoresDeOrden(orden);
    expect(i.horasCorte).toBeCloseTo(33, 5);
    expect(i.horasGuarnicion).toBeCloseTo(72, 5);
  });

  it('sin toques todavía, los ciclos son null (no cero)', () => {
    const i = indicadoresDeOrden({ lineas: [], avances: [] });
    expect(i.horasCorte).toBeNull();
    expect(i.horasGuarnicion).toBeNull();
  });

  it('una orden sin nada programado no divide por cero', () => {
    const i = indicadoresDeOrden({ lineas: [], avances: [] });
    expect(i.cumplimiento).toBeNull();
    expect(i.indiceReposicion).toBeNull();
    expect(i.rendimientoGuarnicion).toBeNull();
  });

  it('cortar de más da cumplimiento mayor a 1: no se recorta el dato real', () => {
    const i = indicadoresDeOrden({
      lineas: [{ cantProgramada: 100, cantCortada: 110, cantAmarrada: 0 }],
      avances: [],
    });
    expect(i.cumplimiento).toBeCloseTo(1.1, 5);
  });
});

describe('alertas', () => {
  const base = {
    lineas: [{ cantProgramada: 1000, cantCortada: 1000, cantAmarrada: 0 }],
    avances: [{ piezasCortadas: 24000, piezasDanadas: 0, piezasRepuestas: 100 }],
  };

  it('avisa cuando corte se demora más del umbral', () => {
    const a = alertasDeOrden(
      { ...base, inicioCorte: new Date('2026-08-17T07:00:00Z'), entregaCorte: new Date('2026-08-20T07:00:00Z') },
      UMBRALES_CORTE_DEFAULT,
    );
    expect(a.map((x) => x.tipo)).toContain('CORTE_DEMORADO');
  });

  it('no avisa si corte estuvo dentro del umbral', () => {
    const a = alertasDeOrden(
      { ...base, inicioCorte: new Date('2026-08-19T07:00:00Z'), entregaCorte: new Date('2026-08-19T17:00:00Z') },
      UMBRALES_CORTE_DEFAULT,
    );
    expect(a.map((x) => x.tipo)).not.toContain('CORTE_DEMORADO');
  });

  it('avisa cuando lo cortado se desvía de lo programado', () => {
    const a = alertasDeOrden(
      {
        lineas: [{ cantProgramada: 1000, cantCortada: 800, cantAmarrada: 0 }],
        avances: [],
        inicioCorte: new Date('2026-08-19T07:00:00Z'),
        entregaCorte: new Date('2026-08-19T17:00:00Z'),
      },
      UMBRALES_CORTE_DEFAULT,
    );
    expect(a.map((x) => x.tipo)).toContain('DESVIACION_CANTIDAD');
  });

  it('NO avisa por desviación mientras corte no haya entregado', () => {
    // Una orden recién programada tiene 0 cortado por definición: medirle
    // cumplimiento ahí la marca con 100% de desviación sin que pase nada malo.
    // Con la programación del mes cargada, TODAS las órdenes futuras saldrían
    // "con alerta" y el contador del tablero dejaría de significar algo.
    const programada = {
      lineas: [{ cantProgramada: 820, cantCortada: 0, cantAmarrada: 0 }],
      avances: [],
    };
    expect(alertasDeOrden(programada, UMBRALES_CORTE_DEFAULT)).toEqual([]);

    const enCorte = { ...programada, inicioCorte: new Date('2026-08-24T06:20:00Z') };
    expect(alertasDeOrden(enCorte, UMBRALES_CORTE_DEFAULT).map((x) => x.tipo)).not.toContain(
      'DESVIACION_CANTIDAD',
    );
  });

  it('avisa cuando las reposiciones se pasan del umbral', () => {
    const a = alertasDeOrden(
      {
        lineas: [{ cantProgramada: 1000, cantCortada: 1000, cantAmarrada: 0 }],
        avances: [{ piezasCortadas: 1000, piezasDanadas: 0, piezasRepuestas: 90 }],
      },
      UMBRALES_CORTE_DEFAULT,
    );
    expect(a.map((x) => x.tipo)).toContain('REPOSICION_ALTA');
  });

  it('una orden sana no genera ninguna alerta', () => {
    const a = alertasDeOrden(
      { ...base, inicioCorte: new Date('2026-08-19T07:00:00Z'), entregaCorte: new Date('2026-08-19T15:00:00Z') },
      UMBRALES_CORTE_DEFAULT,
    );
    expect(a).toEqual([]);
  });

  it('cada alerta explica qué pasó, no solo que pasó', () => {
    const a = alertasDeOrden(
      {
        lineas: [{ cantProgramada: 1000, cantCortada: 500, cantAmarrada: 0 }],
        avances: [],
        inicioCorte: new Date('2026-08-19T07:00:00Z'),
        entregaCorte: new Date('2026-08-19T17:00:00Z'),
      },
      UMBRALES_CORTE_DEFAULT,
    );
    expect(a[0].mensaje).toMatch(/500/);
    expect(a[0].mensaje).toMatch(/1000|1\.000/);
  });
});

describe('lectura del formato de programación del cliente', () => {
  // El formato real: una fila por orden, una columna por talla.
  const fila = {
    codigo: 'AGR-861',
    tallas: { 34: 40, 35: 40, 36: 60, 37: 80, 38: 160, 39: 240, 40: 240, 41: 240, 42: 80, 43: 26, 44: 0, 45: 0, 46: 0 },
  };
  const idPorTalla = new Map<number, number>(
    [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46].map((t, i) => [t, i + 1]),
  );

  it('convierte las columnas de talla en líneas de orden', () => {
    const lineas = lineasDesdeProgramacion(fila, 7, idPorTalla);
    expect(lineas).toHaveLength(10);
    expect(lineas[0]).toEqual({ productoConfiguradoId: 7, tallaId: 1, cantProgramada: 40 });
  });

  it('descarta las tallas en cero: no son renglones del pedido', () => {
    const lineas = lineasDesdeProgramacion(fila, 7, idPorTalla);
    expect(lineas.every((l) => l.cantProgramada > 0)).toBe(true);
  });

  it('el total cuadra con la columna TOTAL del formato', () => {
    const lineas = lineasDesdeProgramacion(fila, 7, idPorTalla);
    expect(lineas.reduce((s, l) => s + l.cantProgramada, 0)).toBe(1206);
  });

  it('revienta si una talla del formato no existe en el catálogo', () => {
    expect(() => lineasDesdeProgramacion({ codigo: 'X', tallas: { 99: 10 } }, 7, idPorTalla)).toThrow(
      /talla 99/i,
    );
  });
});

describe('fecha de la jornada', () => {
  // La orden de corte ES del día: si la fecha se corre, la orden cambia de
  // identidad. `new Date('2026-08-01')` cae en medianoche UTC, que en Colombia
  // (UTC-5) es el 31 de julio a las 19:00 — un día menos en pantalla.
  it('conserva el día que se programó, no el de la zona horaria', () => {
    const f = fechaDeJornada('2026-08-01');
    expect(f.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('lo ancla al mediodía UTC para que aguante todo el continente', () => {
    expect(fechaDeJornada('2026-08-01').getUTCHours()).toBe(12);
  });

  it('en hora de Colombia sigue cayendo el mismo día', () => {
    const f = fechaDeJornada('2026-08-01');
    const enBogota = new Date(f.getTime() - 5 * 3600_000);
    expect(enBogota.toISOString().slice(0, 10)).toBe('2026-08-01');
  });

  it('acepta también una fecha con hora y se queda con el día', () => {
    expect(fechaDeJornada('2026-08-03T22:30:00Z').toISOString().slice(0, 10)).toBe('2026-08-03');
  });

  it('rechaza una fecha que no se entiende', () => {
    expect(() => fechaDeJornada('no-es-fecha')).toThrow(/fecha/i);
  });
});

describe('rango de jornadas para filtrar', () => {
  it('el día "hasta" queda INCLUIDO: la orden de ese día vive al mediodía', () => {
    const { gte, lte } = rangoDeJornadas('2026-08-01', '2026-08-31');
    const ordenDel31 = fechaDeJornada('2026-08-31');
    expect(ordenDel31.getTime()).toBeLessThanOrEqual(lte!.getTime());
    expect(ordenDel31.getTime()).toBeGreaterThanOrEqual(gte!.getTime());
  });

  it('el día "desde" también queda incluido', () => {
    const { gte } = rangoDeJornadas('2026-08-01', undefined);
    expect(fechaDeJornada('2026-08-01').getTime()).toBeGreaterThanOrEqual(gte!.getTime());
  });

  it('sin filtros no arma rango', () => {
    expect(rangoDeJornadas(undefined, undefined)).toEqual({});
  });
});

describe('consolidar el consumo de material de la orden', () => {
  // Una orden se corta en varios días; el mismo material aparece en varios avances.
  const avances = [
    { consumos: [
      { material: { id: 3, codigo: 'MP-001', nombreCanonico: 'Micropiel negra' }, cantTeorica: '10.0000', cantReal: '11.0000' },
      { material: { id: 5, codigo: 'MP-002', nombreCanonico: 'Malla falcao' }, cantTeorica: '4.0000', cantReal: '4.0000' },
    ] },
    { consumos: [
      { material: { id: 3, codigo: 'MP-001', nombreCanonico: 'Micropiel negra' }, cantTeorica: '20.0000', cantReal: '19.0000' },
    ] },
  ];

  it('suma el mismo material aunque venga en avances distintos', () => {
    const r = consolidarConsumos(avances);
    const micro = r.find((x) => x.materialId === 3)!;
    expect(micro.cantTeorica).toBeCloseTo(30, 4);
    expect(micro.cantReal).toBeCloseTo(30, 4);
  });

  it('convierte los Decimal de Prisma, que llegan como string', () => {
    const r = consolidarConsumos(avances);
    expect(typeof r[0].cantReal).toBe('number');
  });

  it('la desviación es cuánto se gastó de más sobre lo teórico', () => {
    const r = consolidarConsumos([
      { consumos: [{ material: { id: 1, codigo: 'X', nombreCanonico: 'X' }, cantTeorica: '100', cantReal: '110' }] },
    ]);
    expect(r[0].desviacion).toBeCloseTo(0.1, 5);
  });

  it('gastar menos de lo teórico da desviación negativa', () => {
    const r = consolidarConsumos([
      { consumos: [{ material: { id: 1, codigo: 'X', nombreCanonico: 'X' }, cantTeorica: '100', cantReal: '90' }] },
    ]);
    expect(r[0].desviacion).toBeCloseTo(-0.1, 5);
  });

  it('un material sin consumo teórico no divide por cero', () => {
    const r = consolidarConsumos([
      { consumos: [{ material: { id: 1, codigo: 'X', nombreCanonico: 'X' }, cantTeorica: '0', cantReal: '5' }] },
    ]);
    expect(r[0].desviacion).toBeNull();
  });

  it('ordena por desviación: lo que más se pasó va primero', () => {
    const r = consolidarConsumos([
      { consumos: [
        { material: { id: 1, codigo: 'A', nombreCanonico: 'A' }, cantTeorica: '100', cantReal: '105' },
        { material: { id: 2, codigo: 'B', nombreCanonico: 'B' }, cantTeorica: '100', cantReal: '130' },
        { material: { id: 3, codigo: 'C', nombreCanonico: 'C' }, cantTeorica: '100', cantReal: '95' },
      ] },
    ]);
    expect(r.map((x) => x.codigo)).toEqual(['B', 'A', 'C']);
  });

  it('una orden sin avances no rompe', () => {
    expect(consolidarConsumos([])).toEqual([]);
  });
});
