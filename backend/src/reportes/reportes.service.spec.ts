import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  const prisma: any = {
    eventoTrazabilidad: { findMany: jest.fn() },
    factura: { findMany: jest.fn() },
    movimientoInventario: { findMany: jest.fn(), groupBy: jest.fn() },
    meta: { findMany: jest.fn(), upsert: jest.fn() },
  };
  const service = new ReportesService(prisma);
  beforeEach(() => jest.clearAllMocks());

  describe('diario', () => {
    it('consulta el rango del mes y arma el reporte', async () => {
      prisma.eventoTrazabilidad.findMany.mockResolvedValue([
        { celula: 'CORTE', timestamp: new Date('2026-06-02T08:00:00Z') },
        { celula: 'INYECCION', timestamp: new Date('2026-06-02T09:00:00Z') },
      ]);
      prisma.factura.findMany.mockResolvedValue([
        { fecha: new Date('2026-06-02T12:00:00Z'), total: 5100000, lineas: [{ cantidad: 50 }, { cantidad: 10 }] },
      ]);
      prisma.movimientoInventario.findMany.mockResolvedValue([
        { tipo: 'SALIDA', motivo: 'DESPACHO', cantidad: 60, createdAt: new Date('2026-06-02T12:30:00Z') },
      ]);
      prisma.movimientoInventario.groupBy.mockResolvedValue([
        { tipo: 'ENTRADA', _sum: { cantidad: 1000 } },
        { tipo: 'SALIDA', _sum: { cantidad: 200 } },
      ]);
      prisma.meta.findMany.mockResolvedValue([{ tipo: 'FACTURACION_PARES', valor: 100 }]);

      const rep = await service.diario(2026, 6);

      // Rango correcto pasado a Prisma (1-jun a 1-jul UTC).
      const where = prisma.eventoTrazabilidad.findMany.mock.calls[0][0].where;
      expect(where.timestamp.gte.toISOString().slice(0, 10)).toBe('2026-06-01');
      expect(where.timestamp.lt.toISOString().slice(0, 10)).toBe('2026-07-01');

      const d2 = rep.filas.find((f) => f.fecha === '2026-06-02')!;
      expect(d2.troquelado).toBe(1);
      expect(d2.inyeccion).toBe(1);
      expect(d2.paresVendidos).toBe(60);
      expect(d2.valor).toBe(5100000);

      expect(rep.metas.facturacionPares).toEqual({ meta: 100, real: 60, pct: 60 });

      // Saldo inicial PT = entradas previas - salidas previas = 800.
      expect(rep.kardexPT[0].saldoInicial).toBe(800);
      const k2 = rep.kardexPT.find((f) => f.fecha === '2026-06-02')!;
      expect(k2.venta).toBe(60);
      expect(k2.saldoFinal).toBe(740);
    });

    it('sin datos: filas en 0 y saldo inicial 0', async () => {
      prisma.eventoTrazabilidad.findMany.mockResolvedValue([]);
      prisma.factura.findMany.mockResolvedValue([]);
      prisma.movimientoInventario.findMany.mockResolvedValue([]);
      prisma.movimientoInventario.groupBy.mockResolvedValue([]);
      prisma.meta.findMany.mockResolvedValue([]);

      const rep = await service.diario(2026, 6);
      expect(rep.acumulado.troquelado).toBe(0);
      expect(rep.kardexPT[0].saldoInicial).toBe(0);
      expect(rep.metas.guarnicion.pct).toBe(0);
    });
  });

  describe('guardarMetas', () => {
    it('hace upsert por cada meta recibida', async () => {
      prisma.meta.upsert.mockResolvedValue({});
      prisma.meta.findMany.mockResolvedValue([]);
      await service.guardarMetas(2026, 6, [
        { tipo: 'GUARNICION', valor: 20160 },
        { tipo: 'INYECCION', valor: 20160 },
      ]);
      expect(prisma.meta.upsert).toHaveBeenCalledTimes(2);
      const arg = prisma.meta.upsert.mock.calls[0][0];
      expect(arg.where.anio_mes_tipo).toEqual({ anio: 2026, mes: 6, tipo: 'GUARNICION' });
      expect(arg.create.valor).toBe(20160);
    });
  });
});
