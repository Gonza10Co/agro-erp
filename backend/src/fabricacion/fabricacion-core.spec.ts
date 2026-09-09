import {
  ORDEN_CELULAS,
  siguienteCelula,
  esUltimaCelula,
  generarPares,
  LineaProduccion,
  siguienteEstado,
  subPasoInyeccionInicial,
  subPasoInicial,
  ORDEN_SUBPASOS,
  ESTACIONES_PILOTO,
  EstacionDef,
  rangoEstado,
  siguienteEstacion,
  esEstacionTerminal,
  estacionNacimiento,
  estacionDeEstado,
  validarEstacion,
  paresPorEstacion,
  avanceHoyPorEstacion,
  inicioDelDiaBogota,
} from './fabricacion-core';

describe('siguienteCelula', () => {
  it('avanza en orden CORTE→GUARNICION→ALMACEN→INYECCION→PT', () => {
    expect(siguienteCelula('CORTE')).toBe('GUARNICION');
    expect(siguienteCelula('GUARNICION')).toBe('ALMACEN');
    expect(siguienteCelula('ALMACEN')).toBe('INYECCION');
    expect(siguienteCelula('INYECCION')).toBe('PT');
  });

  it('PT no tiene siguiente (null)', () => {
    expect(siguienteCelula('PT')).toBeNull();
  });

  it('expone el orden completo de 5 células', () => {
    expect(ORDEN_CELULAS).toEqual(['CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT']);
  });

  it('lanza error ante una célula desconocida (no la trata como PT)', () => {
    expect(() => siguienteCelula('XXX' as never)).toThrow('Célula desconocida');
  });
});

describe('esUltimaCelula', () => {
  it('solo PT es la última', () => {
    expect(esUltimaCelula('PT')).toBe(true);
    expect(esUltimaCelula('CORTE')).toBe(false);
    expect(esUltimaCelula('INYECCION')).toBe(false);
  });
});

describe('ORDEN_SUBPASOS', () => {
  it('son 10 sub-pasos en orden: PREPARACION primero (nace el par), AMARRE último', () => {
    expect(ORDEN_SUBPASOS).toHaveLength(10);
    expect(ORDEN_SUBPASOS[0]).toBe('PREPARACION');
    expect(ORDEN_SUBPASOS[1]).toBe('AREA');
    expect(ORDEN_SUBPASOS[9]).toBe('AMARRE');
  });
});

describe('siguienteEstado', () => {
  it('CORTE entra a Guarnición en PREPARACION (donde nace el par)', () => {
    expect(siguienteEstado({ celula: 'CORTE', subPaso: null }))
      .toEqual({ celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null });
  });
  it('avanza sub-paso a sub-paso dentro de Guarnición', () => {
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'PREPARACION' }))
      .toEqual({ celula: 'GUARNICION', subPaso: 'AREA', subPasoInyeccion: null });
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'AREA' }))
      .toEqual({ celula: 'GUARNICION', subPaso: 'ARMADO', subPasoInyeccion: null });
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'STROBEL' }))
      .toEqual({ celula: 'GUARNICION', subPaso: 'AMARRE', subPasoInyeccion: null });
  });
  it('desde AMARRE sale la capellada a Almacén (subPaso null)', () => {
    expect(siguienteEstado({ celula: 'GUARNICION', subPaso: 'AMARRE' }))
      .toEqual({ celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null });
  });
  it('Almacén entra a Inyección en MONTAJE', () => {
    expect(siguienteEstado({ celula: 'ALMACEN', subPaso: null }))
      .toEqual({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE' });
  });
  it('avanza sub-paso a sub-paso dentro de Inyección', () => {
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE' }))
      .toEqual({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'INYECCION' });
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'INYECCION' }))
      .toEqual({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'FINIZAJE' });
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'FINIZAJE' }))
      .toEqual({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'IMPACTO' });
  });
  it('desde IMPACTO sale a Producto Terminado', () => {
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'IMPACTO' }))
      .toEqual({ celula: 'PT', subPaso: null, subPasoInyeccion: null });
  });
  it('un par que ya estaba en Inyección sin sub-paso sale a PT en un solo escaneo', () => {
    // Compatibilidad: los pares en curso el día del cambio no vuelven al principio
    // de la cadena a repetir trabajo que en el piso ya está hecho.
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null }))
      .toEqual({ celula: 'PT', subPaso: null, subPasoInyeccion: null });
    expect(siguienteEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: null }))
      .toEqual({ celula: 'PT', subPaso: null, subPasoInyeccion: null });
  });
  it('PT es el final', () => {
    expect(siguienteEstado({ celula: 'PT', subPaso: null })).toBeNull();
  });
  it('lanza ante célula o sub-paso desconocido', () => {
    expect(() => siguienteEstado({ celula: 'XXX' as any, subPaso: null })).toThrow();
    expect(() =>
      siguienteEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'XXX' as any }),
    ).toThrow();
  });
});

describe('subPasoInyeccionInicial', () => {
  it('un par que arranca en Inyección (línea Feroz) empieza en MONTAJE', () => {
    expect(subPasoInyeccionInicial('INYECCION')).toBe('MONTAJE');
  });
  it('cualquier otra célula de arranque no tiene sub-paso de inyección', () => {
    expect(subPasoInyeccionInicial('CORTE')).toBeNull();
    expect(subPasoInyeccionInicial('GUARNICION')).toBeNull();
  });
});

describe('generarPares', () => {
  const lineas: LineaProduccion[] = [
    { productoConfiguradoId: 10, tallaId: 1, cantAProducir: 2 },
    { productoConfiguradoId: 10, tallaId: 2, cantAProducir: 1 },
  ];

  it('genera un par por unidad de cantAProducir', () => {
    const pares = generarPares(5, lineas);
    expect(pares).toHaveLength(3);
  });

  it('asigna códigos únicos y bien formados OF{consecutivo}-{seq:0000}', () => {
    const pares = generarPares(5, lineas);
    expect(pares.map((p) => p.codigo)).toEqual([
      'OF5-0001',
      'OF5-0002',
      'OF5-0003',
    ]);
    expect(new Set(pares.map((p) => p.codigo)).size).toBe(3);
  });

  it('mapea producto y talla de cada línea', () => {
    const pares = generarPares(5, lineas);
    expect(pares[0]).toMatchObject({ productoConfiguradoId: 10, tallaId: 1 });
    expect(pares[1]).toMatchObject({ productoConfiguradoId: 10, tallaId: 1 });
    expect(pares[2]).toMatchObject({ productoConfiguradoId: 10, tallaId: 2 });
  });

  it('ignora líneas con cantAProducir <= 0', () => {
    const pares = generarPares(9, [
      { productoConfiguradoId: 1, tallaId: 1, cantAProducir: 0 },
      { productoConfiguradoId: 1, tallaId: 2, cantAProducir: 2 },
    ]);
    expect(pares).toHaveLength(2);
    expect(pares[0].codigo).toBe('OF9-0001');
  });

  it('sin celulaInicial arranca en CORTE con subPaso null (comportamiento histórico)', () => {
    const pares = generarPares(5, lineas);
    expect(pares[0]).toMatchObject({ celulaInicial: 'CORTE', subPasoInicial: null });
  });

  it('propaga la celulaInicial y el lineaId de la línea a cada par (Feroz arranca en INYECCION)', () => {
    const pares = generarPares(7, [
      { productoConfiguradoId: 20, tallaId: 3, cantAProducir: 2, celulaInicial: 'INYECCION', lineaId: 4 },
    ]);
    expect(pares).toHaveLength(2);
    // Arranca en el primer sub-paso de inyección: es lo que la línea Feroz viene
    // a que le hagan (le inyectan la suela a una capellada que llega de Bogotá).
    expect(pares.every((p) =>
      p.celulaInicial === 'INYECCION' &&
      p.subPasoInicial === null &&
      p.subPasoInyeccionInicial === 'MONTAJE' &&
      p.lineaId === 4)).toBe(true);
  });

  it('sin lineaId el par queda con lineaId null', () => {
    const pares = generarPares(5, lineas);
    expect(pares[0].lineaId).toBeNull();
  });

  it('arrancar en GUARNICION deja el par en el sub-paso PREPARACION', () => {
    const pares = generarPares(8, [
      { productoConfiguradoId: 30, tallaId: 1, cantAProducir: 1, celulaInicial: 'GUARNICION' },
    ]);
    expect(pares[0]).toMatchObject({ celulaInicial: 'GUARNICION', subPasoInicial: 'PREPARACION' });
  });

  it('la numeración continúa desde seqInicial: los pares nacen en tandas', () => {
    const pares = generarPares(5, [{ productoConfiguradoId: 10, tallaId: 1, cantAProducir: 2 }], 7);
    expect(pares.map((p) => p.codigo)).toEqual(['OF5-0008', 'OF5-0009']);
  });

  it('la línea puede fijar en qué sub-paso nace el par', () => {
    // El punto de conversión lote→par. Cuál es exactamente lo decide la planta
    // (Amarre o Alistamiento), así que viaja como dato, no como código.
    const pares = generarPares(9, [
      {
        productoConfiguradoId: 30,
        tallaId: 1,
        cantAProducir: 2,
        celulaInicial: 'GUARNICION',
        subPasoInicial: 'AMARRE',
      },
    ]);
    expect(pares.every((p) => p.subPasoInicial === 'AMARRE')).toBe(true);
  });

  it('sin punto de nacimiento configurado nace en PREPARACION', () => {
    const pares = generarPares(10, [
      { productoConfiguradoId: 30, tallaId: 1, cantAProducir: 1, celulaInicial: 'GUARNICION', subPasoInicial: null },
    ]);
    expect(pares[0].subPasoInicial).toBe('PREPARACION');
  });
});

describe('subPasoInicial', () => {
  it('solo GUARNICION arranca en un sub-paso (PREPARACION); el resto en null', () => {
    expect(subPasoInicial('GUARNICION')).toBe('PREPARACION');
    expect(subPasoInicial('CORTE')).toBeNull();
    expect(subPasoInicial('INYECCION')).toBeNull();
    expect(subPasoInicial('PT')).toBeNull();
  });

  it('acepta el punto de nacimiento que fije la línea', () => {
    expect(subPasoInicial('GUARNICION', 'AMARRE')).toBe('AMARRE');
    expect(subPasoInicial('GUARNICION', 'STROBEL')).toBe('STROBEL');
  });

  it('el punto de nacimiento no aplica fuera de guarnición', () => {
    // Feroz nace en INYECCION: un sub-paso de guarnición ahí no significa nada.
    expect(subPasoInicial('INYECCION', 'AMARRE')).toBeNull();
    expect(subPasoInicial('CORTE', 'AMARRE')).toBeNull();
  });
});

// ───────────────────────── Estaciones del piloto ─────────────────────────

const conCierre = (): EstacionDef[] =>
  ESTACIONES_PILOTO.map((x) => (x.codigo === 'CIERRE' ? { ...x, activa: true } : { ...x }));

describe('ESTACIONES_PILOTO', () => {
  it('son 6 en orden, con Cierre modelada pero apagada', () => {
    expect(ESTACIONES_PILOTO.map((x) => x.codigo)).toEqual([
      'PREPARACION', 'CIERRE', 'BODEGA_CORTE', 'MONTAJE', 'FINIZAJE', 'PT',
    ]);
    expect(ESTACIONES_PILOTO.filter((x) => x.activa)).toHaveLength(5);
    expect(ESTACIONES_PILOTO.find((x) => x.codigo === 'CIERRE')!.activa).toBe(false);
  });
});

describe('rangoEstado', () => {
  it('ordena células y sub-pasos en una sola recta', () => {
    const r = (e: any) => rangoEstado(e);
    expect(r({ celula: 'CORTE', subPaso: null })).toBeLessThan(r({ celula: 'GUARNICION', subPaso: 'PREPARACION' }));
    expect(r({ celula: 'GUARNICION', subPaso: 'PREPARACION' })).toBeLessThan(r({ celula: 'GUARNICION', subPaso: 'AREA' }));
    expect(r({ celula: 'GUARNICION', subPaso: 'AMARRE' })).toBeLessThan(r({ celula: 'ALMACEN', subPaso: null }));
    expect(r({ celula: 'ALMACEN', subPaso: null })).toBeLessThan(r({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE' }));
    expect(r({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'IMPACTO' })).toBeLessThan(r({ celula: 'PT', subPaso: null }));
  });
  it('un par en Inyección sin sub-paso (anterior al cambio) queda después de IMPACTO', () => {
    expect(rangoEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: null }))
      .toBeGreaterThan(rangoEstado({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'IMPACTO' }));
  });
  it('lanza ante célula o sub-paso desconocido', () => {
    expect(() => rangoEstado({ celula: 'XXX' as any, subPaso: null })).toThrow();
    expect(() => rangoEstado({ celula: 'GUARNICION', subPaso: 'XXX' as any })).toThrow();
  });
});

describe('siguienteEstacion (los 5 pistolazos)', () => {
  const E = ESTACIONES_PILOTO;
  it('un par recién nacido en Preparación va a Bodega de corte (Cierre apagada)', () => {
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'PREPARACION' }, E)?.codigo).toBe('BODEGA_CORTE');
  });
  it('con Cierre prendida, de Preparación pasa por Cierre', () => {
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'PREPARACION' }, conCierre())?.codigo).toBe('CIERRE');
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'CIERRE' }, conCierre())?.codigo).toBe('BODEGA_CORTE');
  });
  it('Bodega → Montaje → Finizaje → PT', () => {
    expect(siguienteEstacion({ celula: 'ALMACEN', subPaso: null }, E)?.codigo).toBe('MONTAJE');
    expect(siguienteEstacion({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE' }, E)?.codigo).toBe('FINIZAJE');
    expect(siguienteEstacion({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'FINIZAJE' }, E)?.codigo).toBe('PT');
  });
  it('en PT no hay siguiente: null', () => {
    expect(siguienteEstacion({ celula: 'PT', subPaso: null }, E)).toBeNull();
  });
  it('un par viejo en cualquier sub-paso de guarnición cae en la siguiente estación activa', () => {
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'AREA' }, E)?.codigo).toBe('BODEGA_CORTE');
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'AMARRE' }, E)?.codigo).toBe('BODEGA_CORTE');
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'ARMADO' }, conCierre())?.codigo).toBe('CIERRE');
    expect(siguienteEstacion({ celula: 'GUARNICION', subPaso: 'STROBEL' }, conCierre())?.codigo).toBe('BODEGA_CORTE');
  });
  it('un par en CORTE (anterior al piloto) entra por Preparación', () => {
    expect(siguienteEstacion({ celula: 'CORTE', subPaso: null }, E)?.codigo).toBe('PREPARACION');
  });
  it('un par en Inyección sin sub-paso sale a PT', () => {
    expect(siguienteEstacion({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: null }, E)?.codigo).toBe('PT');
  });
  it('estacionDeEstado reconoce la estación exacta y devuelve undefined entre estaciones', () => {
    expect(estacionDeEstado({ celula: 'ALMACEN', subPaso: null }, E)?.codigo).toBe('BODEGA_CORTE');
    expect(estacionDeEstado({ celula: 'GUARNICION', subPaso: 'STROBEL' }, E)).toBeUndefined();
  });
});

describe('esEstacionTerminal', () => {
  it('entrar a PT es terminar; null también (ya no hay más)', () => {
    expect(esEstacionTerminal(ESTACIONES_PILOTO.find((x) => x.codigo === 'PT')!)).toBe(true);
    expect(esEstacionTerminal(null)).toBe(true);
    expect(esEstacionTerminal(ESTACIONES_PILOTO.find((x) => x.codigo === 'FINIZAJE')!)).toBe(false);
  });
});

describe('estacionNacimiento', () => {
  it('Basarili (arranca en CORTE) nace en Preparación', () => {
    expect(estacionNacimiento('CORTE', ESTACIONES_PILOTO)?.codigo).toBe('PREPARACION');
    expect(estacionNacimiento('GUARNICION', ESTACIONES_PILOTO)?.codigo).toBe('PREPARACION');
  });
  it('Feroz (capellada de Bogotá) nace en Montaje', () => {
    expect(estacionNacimiento('INYECCION', ESTACIONES_PILOTO)?.codigo).toBe('MONTAJE');
  });
  it('sin estaciones activas no hay dónde nacer', () => {
    expect(estacionNacimiento('CORTE', ESTACIONES_PILOTO.map((x) => ({ ...x, activa: false })))).toBeNull();
  });
});

describe('validarEstacion (el dispositivo está amarrado a una estación)', () => {
  const E = ESTACIONES_PILOTO;
  it('acepta el pistolazo en la estación que le toca', () => {
    expect(validarEstacion({ celula: 'GUARNICION', subPaso: 'PREPARACION' }, 'BODEGA_CORTE', E)).toBeNull();
    expect(validarEstacion({ celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'FINIZAJE' }, 'PT', E)).toBeNull();
  });
  it('rechaza saltarse una estación, diciendo de dónde viene y cuál le toca', () => {
    const msg = validarEstacion({ celula: 'GUARNICION', subPaso: 'PREPARACION' }, 'MONTAJE', E);
    expect(msg).toContain('viene de Preparación');
    expect(msg).toContain('le toca Bodega de corte');
  });
  it('rechaza una estación apagada o inexistente', () => {
    expect(validarEstacion({ celula: 'GUARNICION', subPaso: 'PREPARACION' }, 'CIERRE', E)).toContain('apagada');
    expect(validarEstacion({ celula: 'GUARNICION', subPaso: 'PREPARACION' }, 'XXX', E)).toContain('no existe');
  });
  it('un par en PT ya recorrió todo', () => {
    expect(validarEstacion({ celula: 'PT', subPaso: null }, 'PT', E)).toContain('recorrió');
  });
});

describe('paresPorEstacion (tablero por órdenes)', () => {
  it('cuenta los que ya pasaron por cada estación; terminados en todas, cancelados en ninguna', () => {
    const r = paresPorEstacion(
      [
        { estado: 'EN_PROCESO', celula: 'GUARNICION', subPaso: 'PREPARACION' },
        { estado: 'EN_PROCESO', celula: 'ALMACEN', subPaso: null },
        { estado: 'EN_PROCESO', celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'FINIZAJE' },
        { estado: 'TERMINADO', celula: 'PT', subPaso: null },
        { estado: 'CANCELADO', celula: 'PT', subPaso: null },
        { estado: 'DADO_DE_BAJA', celula: 'ALMACEN', subPaso: null },
      ],
      ESTACIONES_PILOTO,
    );
    expect(r).toEqual({ PREPARACION: 4, BODEGA_CORTE: 3, MONTAJE: 2, FINIZAJE: 2, PT: 1 });
  });
});

describe('avanceHoyPorEstacion (TV de planta)', () => {
  it('cuenta entradas de hoy por estación y las de la última hora', () => {
    const ahora = new Date('2026-09-09T20:00:00Z'); // 15:00 Bogotá
    const inicio = new Date('2026-09-09T05:00:00Z');
    const r = avanceHoyPorEstacion(
      [
        { estacionDestino: 'BODEGA_CORTE', timestamp: new Date('2026-09-09T19:30:00Z') },
        { estacionDestino: 'BODEGA_CORTE', timestamp: new Date('2026-09-09T12:00:00Z') },
        { estacionDestino: 'BODEGA_CORTE', timestamp: new Date('2026-09-08T19:30:00Z') }, // ayer
        { estacionDestino: 'PT', timestamp: new Date('2026-09-09T19:59:00Z') },
        { estacionDestino: null, timestamp: new Date('2026-09-09T19:59:00Z') }, // evento viejo, sin estación
      ],
      ESTACIONES_PILOTO,
      inicio,
      ahora,
    );
    const bodega = r.find((x) => x.codigo === 'BODEGA_CORTE')!;
    expect(bodega).toMatchObject({ hoy: 2, ultimaHora: 1, celula: 'ALMACEN' });
    expect(r.find((x) => x.codigo === 'PT')).toMatchObject({ hoy: 1, ultimaHora: 1 });
    expect(r.find((x) => x.codigo === 'CIERRE')).toBeUndefined(); // apagada: no sale en la TV
  });
});

describe('inicioDelDiaBogota', () => {
  it('a las 3 am UTC todavía es el día anterior en Bogotá', () => {
    expect(inicioDelDiaBogota(new Date('2026-09-10T03:00:00Z')).toISOString()).toBe('2026-09-09T05:00:00.000Z');
    expect(inicioDelDiaBogota(new Date('2026-09-10T06:00:00Z')).toISOString()).toBe('2026-09-10T05:00:00.000Z');
  });
});
