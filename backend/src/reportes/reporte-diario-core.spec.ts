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
      ],
      ventas: [
        { fecha: new Date('2026-06-02T12:00:00Z'), pares: 50, valor: 4250000 },
        { fecha: new Date('2026-06-02T15:00:00Z'), pares: 10, valor: 850000 },
      ],
      metas: [
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

    it('deja en 0 las columnas pendientes de captura', () => {
      for (const f of rep.filas) {
        expect(f.externo).toBe(0);
        expect(f.segundas).toBe(0);
      }
      expect(rep.pendientes).toEqual(COLUMNAS_PENDIENTES);
    });

    it('acumula cada columna del mes', () => {
      expect(rep.acumulado.troquelado).toBe(2);
      expect(rep.acumulado.guarnicion).toBe(1);
      expect(rep.acumulado.inyeccion).toBe(1);
      expect(rep.acumulado.paresVendidos).toBe(60);
      expect(rep.acumulado.valor).toBe(5100000);
    });

    it('arma el bloque de metas con su % de cumplimiento', () => {
      expect(rep.metas.guarnicion).toEqual({ meta: 1, real: 1, pct: 100 });
      expect(rep.metas.inyeccion).toEqual({ meta: 2, real: 1, pct: 50 });
      expect(rep.metas.facturacionPares).toEqual({ meta: 100, real: 60, pct: 60 });
      expect(rep.metas.facturacionValor.real).toBe(5100000);
      expect(rep.metas.facturacionValor.pct).toBe(51);
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

    it('falla sin metas: cae a meta 0 y pct 0', () => {
      const sinMetas = construirReporte({ ...input, metas: [] });
      expect(sinMetas.metas.guarnicion).toEqual({ meta: 0, real: 1, pct: 0 });
    });
  });
});
