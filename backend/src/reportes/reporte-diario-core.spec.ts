import {
  claveDia,
  columnaDeCelula,
  pctCumplimiento,
  construirReporte,
  COLUMNAS_PENDIENTES,
  InputReporte,
} from './reporte-diario-core';

describe('reporte-diario-core', () => {
  describe('claveDia', () => {
    it('formatea la fecha como YYYY-MM-DD en UTC', () => {
      expect(claveDia(new Date('2026-06-16T23:30:00Z'))).toBe('2026-06-16');
    });
  });

  describe('columnaDeCelula', () => {
    it('mapea cada célula a su columna del reporte', () => {
      expect(columnaDeCelula('CORTE')).toBe('troquelado');
      expect(columnaDeCelula('GUARNICION')).toBe('guarnicion');
      expect(columnaDeCelula('ALMACEN')).toBe('almacen');
      expect(columnaDeCelula('INYECCION')).toBe('inyeccion');
      expect(columnaDeCelula('PT')).toBe('bodega');
    });
  });

  describe('pctCumplimiento', () => {
    it('calcula real/meta * 100 redondeado a 1 decimal', () => {
      expect(pctCumplimiento(20120, 20160)).toBe(99.8);
      expect(pctCumplimiento(21514, 20160)).toBe(106.7);
    });
    it('devuelve 0 si la meta es 0 o negativa (evita división por cero)', () => {
      expect(pctCumplimiento(100, 0)).toBe(0);
      expect(pctCumplimiento(0, 0)).toBe(0);
    });
  });

  describe('construirReporte', () => {
    const input: InputReporte = {
      anio: 2026,
      mes: 6,
      eventos: [
        { celula: 'CORTE', timestamp: new Date('2026-06-01T08:00:00Z') },
        { celula: 'CORTE', timestamp: new Date('2026-06-01T09:00:00Z') },
        // Sub-pasos intermedios de Guarnición NO cuentan; solo AMARRE (la salida).
        { celula: 'GUARNICION', subPaso: 'STROBEL', timestamp: new Date('2026-06-01T09:30:00Z') },
        { celula: 'GUARNICION', subPaso: 'AMARRE', timestamp: new Date('2026-06-01T10:00:00Z') },
        { celula: 'INYECCION', timestamp: new Date('2026-06-02T10:00:00Z') },
        { celula: 'PT', timestamp: new Date('2026-06-02T11:00:00Z') },
        // Un par que se marcó de segunda: llega a PT igual, pero no suma a Bodega.
        { celula: 'PT', timestamp: new Date('2026-06-02T11:30:00Z'), esSegunda: true },
      ],
      ventas: [
        { fecha: new Date('2026-06-02T12:00:00Z'), pares: 50, valor: 4250000 },
        { fecha: new Date('2026-06-02T15:00:00Z'), pares: 10, valor: 850000 },
      ],
      metas: [
        { tipo: 'CORTE', valor: 4 },
        { tipo: 'GUARNICION', valor: 1 },
        { tipo: 'INYECCION', valor: 2 },
        { tipo: 'FACTURACION_PARES', valor: 100 },
        { tipo: 'FACTURACION_VALOR', valor: 10000000 },
      ],
      saldoInicialPT: 1000,
      movimientosPT: [
        { tipo: 'ENTRADA', motivo: 'PRODUCCION', cantidad: 1, createdAt: new Date('2026-06-02T11:00:00Z') },
        { tipo: 'SALIDA', motivo: 'DESPACHO', cantidad: 60, createdAt: new Date('2026-06-02T12:30:00Z') },
        { tipo: 'ENTRADA', motivo: 'DEVOLUCION_CLIENTE', cantidad: 5, createdAt: new Date('2026-06-03T09:00:00Z') },
      ],
    };

    const rep = construirReporte(input);

    it('genera una fila por cada día del mes', () => {
      expect(rep.filas).toHaveLength(30); // junio
      expect(rep.filas[0].fecha).toBe('2026-06-01');
      expect(rep.filas[29].fecha).toBe('2026-06-30');
    });

    it('agrupa la producción por célula y día', () => {
      const d1 = rep.filas.find((f) => f.fecha === '2026-06-01')!;
      expect(d1.troquelado).toBe(2);
      expect(d1.guarnicion).toBe(1);
      const d2 = rep.filas.find((f) => f.fecha === '2026-06-02')!;
      expect(d2.inyeccion).toBe(1);
      expect(d2.bodega).toBe(1);
    });

    it('agrega pares vendidos y valor por día', () => {
      const d2 = rep.filas.find((f) => f.fecha === '2026-06-02')!;
      expect(d2.paresVendidos).toBe(60);
      expect(d2.valor).toBe(5100000);
    });

    it('deja en 0 las columnas que aún no se capturan (ya no incluye segundas ni servicios)', () => {
      for (const f of rep.filas) expect(f.externo).toBe(0);
      expect(rep.pendientes).toEqual(COLUMNAS_PENDIENTES);
      expect(rep.pendientes).not.toContain('SEGUNDAS');
      expect(rep.pendientes).not.toContain('SERVICIOS_MANTENIMIENTO');
    });

    describe('SERVICIOS (maquila)', () => {
      const conServicio = construirReporte({
        ...input,
        ventas: [
          ...input.ventas,
          // Maquila de Feroz: 2.016 pares inyectados a la capellada de Bogotá.
          { fecha: new Date('2026-06-10T10:00:00Z'), pares: 2016, valor: 8467200, esServicio: true },
        ],
      });

      it('la maquila va en su propia columna, no en la venta de producto', () => {
        const d10 = conServicio.filas.find((f) => f.fecha === '2026-06-10')!;
        expect(d10.servicios).toBe(8467200);
        expect(d10.valor).toBe(0);
      });

      it('no cuenta pares vendidos: el servicio no despacha producto propio', () => {
        expect(conServicio.acumulado.paresVendidos).toBe(60); // igual que sin servicio
      });

      it('no infla la meta comercial en valor', () => {
        // La meta de facturación sigue midiéndose contra la venta de botas.
        expect(conServicio.metas.facturacionValor.real).toBe(5100000);
        expect(conServicio.acumulado.servicios).toBe(8467200);
      });
    });

    describe('SEGUNDAS', () => {
      it('cuenta los pares de segunda que llegan a PT en su propia columna', () => {
        const d2 = rep.filas.find((f) => f.fecha === '2026-06-02')!;
        expect(d2.segundas).toBe(1);
      });

      it('no las suma a Bodega: son saldos distintos, no producto bueno', () => {
        const d2 = rep.filas.find((f) => f.fecha === '2026-06-02')!;
        expect(d2.bodega).toBe(1); // el par de primera, no los dos
        expect(rep.acumulado.bodega).toBe(1);
        expect(rep.acumulado.segundas).toBe(1);
      });

      it('una segunda detectada antes de PT igual cuenta en las células que recorrió', () => {
        const conSegundaEnCorte = construirReporte({
          ...input,
          eventos: [
            { celula: 'CORTE', timestamp: new Date('2026-06-05T08:00:00Z'), esSegunda: true },
            { celula: 'PT', timestamp: new Date('2026-06-05T18:00:00Z'), esSegunda: true },
          ],
        });
        const d5 = conSegundaEnCorte.filas.find((f) => f.fecha === '2026-06-05')!;
        expect(d5.troquelado).toBe(1); // el corte se hizo: cuenta como producción
        expect(d5.bodega).toBe(0);
        expect(d5.segundas).toBe(1);
      });

      it('la meta de PT se mide contra producto de primera, no contra segundas', () => {
        const conMetaPT = construirReporte({
          ...input,
          metas: [...input.metas, { tipo: 'PT', valor: 10 }],
        });
        const pt = conMetaPT.metas.celulas.find((c) => c.celula === 'PT')!;
        expect(pt.real).toBe(1); // solo la primera
      });
    });

    it('acumula cada columna del mes', () => {
      expect(rep.acumulado.troquelado).toBe(2);
      expect(rep.acumulado.guarnicion).toBe(1);
      expect(rep.acumulado.inyeccion).toBe(1);
      expect(rep.acumulado.paresVendidos).toBe(60);
      expect(rep.acumulado.valor).toBe(5100000);
    });

    it('arma el bloque de metas con su % de cumplimiento', () => {
      expect(rep.metas.facturacionPares).toEqual({ meta: 100, real: 60, pct: 60, esperado: 100, pctEsperado: 60, diaria: 0 });
      expect(rep.metas.facturacionValor.real).toBe(5100000);
      expect(rep.metas.facturacionValor.pct).toBe(51);
    });

    describe('metas POR CÉLULA', () => {
      it('trae una meta por cada célula, en el orden del flujo de planta', () => {
        expect(rep.metas.celulas.map((c) => c.celula)).toEqual([
          'CORTE', 'GUARNICION', 'ALMACEN', 'INYECCION', 'PT',
        ]);
      });

      it('cruza cada célula contra su columna de producción real', () => {
        const porCelula = Object.fromEntries(rep.metas.celulas.map((c) => [c.celula, c]));
        // Corte: 2 eventos contra meta 4.
        expect(porCelula['CORTE']).toEqual({ celula: 'CORTE', meta: 4, real: 2, pct: 50, esperado: 4, pctEsperado: 50, diaria: 0 });
        // Guarnición cuenta solo el sub-paso AMARRE (la salida real de la célula).
        expect(porCelula['GUARNICION']).toEqual({ celula: 'GUARNICION', meta: 1, real: 1, pct: 100, esperado: 1, pctEsperado: 100, diaria: 0 });
        expect(porCelula['INYECCION']).toEqual({ celula: 'INYECCION', meta: 2, real: 1, pct: 50, esperado: 2, pctEsperado: 50, diaria: 0 });
        // PT tiene producción real (1 par) pero todavía nadie le puso meta.
        expect(porCelula['PT']).toEqual({ celula: 'PT', meta: 0, real: 1, pct: 0, esperado: 0, pctEsperado: 0, diaria: 0 });
        // Almacén: sin eventos y sin meta.
        expect(porCelula['ALMACEN']).toEqual({ celula: 'ALMACEN', meta: 0, real: 0, pct: 0, esperado: 0, pctEsperado: 0, diaria: 0 });
      });
    });

    it('arma el kardex de PT arrastrando el saldo día a día', () => {
      const k1 = rep.kardexPT.find((f) => f.fecha === '2026-06-01')!;
      expect(k1.saldoInicial).toBe(1000);
      expect(k1.saldoFinal).toBe(1000); // sin movimientos ese día

      const k2 = rep.kardexPT.find((f) => f.fecha === '2026-06-02')!;
      expect(k2.saldoInicial).toBe(1000);
      expect(k2.ingreso).toBe(1);
      expect(k2.venta).toBe(60);
      expect(k2.saldoFinal).toBe(941); // 1000 + 1 - 60

      const k3 = rep.kardexPT.find((f) => f.fecha === '2026-06-03')!;
      expect(k3.saldoInicial).toBe(941);
      expect(k3.devolucion).toBe(5);
      expect(k3.saldoFinal).toBe(946); // 941 + 5
    });

    it('falla sin metas: cae a meta 0 y pct 0, pero sigue trayendo las 5 células', () => {
      const sinMetas = construirReporte({ ...input, metas: [] });
      expect(sinMetas.metas.celulas).toHaveLength(5);
      const guarnicion = sinMetas.metas.celulas.find((c) => c.celula === 'GUARNICION')!;
      expect(guarnicion).toEqual({ celula: 'GUARNICION', meta: 0, real: 1, pct: 0, esperado: 0, pctEsperado: 0, diaria: 0 });
      expect(sinMetas.metas.facturacionPares).toEqual({ meta: 0, real: 60, pct: 0, esperado: 0, pctEsperado: 0, diaria: 0 });
    });

    describe('META DIARIA contra días hábiles', () => {
      // Junio 2026: 22 días hábiles de lunes a viernes. Meta de corte 22.000 pares
      // → 1.000 diarios. El input base tiene 2 pares troquelados el día 1.
      const LUN_A_VIE = { diasSemana: [false, true, true, true, true, true, false], noHabiles: [] };
      const conCalendario = (extra: Partial<InputReporte> = {}) =>
        construirReporte({
          ...input,
          metas: [{ tipo: 'CORTE' as const, valor: 22000 }],
          calendario: LUN_A_VIE,
          ...extra,
        });

      it('reparte la meta mensual en el ritmo diario que exige', () => {
        const corte = conCalendario().metas.celulas.find((c) => c.celula === 'CORTE')!;
        expect(corte.diaria).toBe(1000);
      });

      it('el día 3 del mes NO se compara contra el mes entero', () => {
        // 3 de junio de 2026 es miércoles: van 3 hábiles de 22 → se esperan 3.000.
        const r = conCalendario({ hoy: new Date('2026-06-03T18:00:00Z') });
        const corte = r.metas.celulas.find((c) => c.celula === 'CORTE')!;
        expect(r.metas.habiles).toEqual({ transcurridos: 3, total: 22 });
        expect(corte.esperado).toBe(3000);
        expect(corte.meta).toBe(22000); // la del mes sigue ahí, para el contexto
      });

      it('el % contra lo esperado es el que dice si se va atrasado', () => {
        const r = conCalendario({ hoy: new Date('2026-06-03T18:00:00Z') });
        const corte = r.metas.celulas.find((c) => c.celula === 'CORTE')!;
        // 2 pares contra 3.000 esperados es 0.1%; contra el mes entero daría 0%.
        expect(corte.pctEsperado).toBe(0.1);
        expect(corte.pct).toBe(0);
      });

      it('los festivos bajan el divisor: menos días para la misma meta', () => {
        const conFestivos = conCalendario({
          calendario: { ...LUN_A_VIE, noHabiles: ['2026-06-15', '2026-06-22', '2026-06-29'] },
        });
        const corte = conFestivos.metas.celulas.find((c) => c.celula === 'CORTE')!;
        expect(conFestivos.metas.habiles.total).toBe(19);
        expect(corte.diaria).toBe(1157.89); // 22000 / 19, hay que apretar el ritmo
      });

      it('trabajar sábados reparte la misma meta en más días', () => {
        const conSabados = conCalendario({
          calendario: { diasSemana: [false, true, true, true, true, true, true], noHabiles: [] },
        });
        const corte = conSabados.metas.celulas.find((c) => c.celula === 'CORTE')!;
        expect(conSabados.metas.habiles.total).toBe(26);
        expect(corte.diaria).toBe(846.15);
      });

      it('marca en cada fila si el día era hábil (para no exigirle meta a un domingo)', () => {
        const r = conCalendario();
        expect(r.filas.find((f) => f.fecha === '2026-06-05')!.esHabil).toBe(true); // viernes
        expect(r.filas.find((f) => f.fecha === '2026-06-07')!.esHabil).toBe(false); // domingo
      });

      it('sin calendario configurado el reporte se comporta como antes', () => {
        // Compatibilidad: desplegar esto no puede cambiarle los números al cliente
        // hasta que alguien configure el calendario.
        const r = construirReporte(input);
        const corte = r.metas.celulas.find((c) => c.celula === 'CORTE')!;
        expect(corte.esperado).toBe(corte.meta);
        expect(corte.pctEsperado).toBe(corte.pct);
        expect(r.metas.habiles).toEqual({ transcurridos: 0, total: 0 });
        expect(r.filas.every((f) => f.esHabil)).toBe(true);
      });

      it('un mes ya cerrado (sin "hoy") se mide contra la meta completa', () => {
        const corte = conCalendario().metas.celulas.find((c) => c.celula === 'CORTE')!;
        expect(corte.esperado).toBe(22000);
      });
    });

    describe('SUB-PASOS DE INYECCIÓN', () => {
      const unPar = (fecha: string) => [
        { celula: 'INYECCION' as const, subPasoInyeccion: 'MONTAJE', timestamp: new Date(fecha) },
        { celula: 'INYECCION' as const, subPasoInyeccion: 'INYECCION', timestamp: new Date(fecha) },
        { celula: 'INYECCION' as const, subPasoInyeccion: 'FINIZAJE', timestamp: new Date(fecha) },
        { celula: 'INYECCION' as const, subPasoInyeccion: 'IMPACTO', timestamp: new Date(fecha) },
      ];

      it('un par que pasa por los 4 sub-pasos cuenta UNA vez, no cuatro', () => {
        const r = construirReporte({ ...input, eventos: unPar('2026-06-03T10:00:00Z') });
        const dia = r.filas.find((d) => d.fecha === '2026-06-03')!;
        expect(dia.inyeccion).toBe(1);
      });

      it('cuenta en el sub-paso de salida (IMPACTO), no cuando entra a montaje', () => {
        const r = construirReporte({
          ...input,
          eventos: [
            { celula: 'INYECCION', subPasoInyeccion: 'MONTAJE', timestamp: new Date('2026-06-03T10:00:00Z') },
            { celula: 'INYECCION', subPasoInyeccion: 'IMPACTO', timestamp: new Date('2026-06-04T10:00:00Z') },
          ],
        });
        expect(r.filas.find((d) => d.fecha === '2026-06-03')!.inyeccion).toBe(0);
        expect(r.filas.find((d) => d.fecha === '2026-06-04')!.inyeccion).toBe(1);
      });

      it('los eventos viejos sin sub-paso siguen contando (no se borra el histórico)', () => {
        const r = construirReporte({
          ...input,
          eventos: [
            { celula: 'INYECCION', timestamp: new Date('2026-06-05T10:00:00Z') },
            { celula: 'INYECCION', subPasoInyeccion: null, timestamp: new Date('2026-06-05T11:00:00Z') },
          ],
        });
        expect(r.filas.find((d) => d.fecha === '2026-06-05')!.inyeccion).toBe(2);
      });

      it('mezcla de histórico y sub-pasos: 1 viejo + 1 par completo = 2', () => {
        const r = construirReporte({
          ...input,
          eventos: [
            { celula: 'INYECCION', timestamp: new Date('2026-06-06T09:00:00Z') },
            ...unPar('2026-06-06T10:00:00Z'),
          ],
        });
        expect(r.filas.find((d) => d.fecha === '2026-06-06')!.inyeccion).toBe(2);
      });
    });
  });
});
