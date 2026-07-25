import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  const prisma: any = {
    eventoTrazabilidad: { findMany: jest.fn() },
    factura: { findMany: jest.fn() },
    movimientoInventario: { findMany: jest.fn(), groupBy: jest.fn() },
    meta: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
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
        { fecha: new Date('2026-06-02T12:00:00Z'), subtotal: 5100000, lineas: [{ cantidad: 50 }, { cantidad: 10 }] },
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

      // Sin filtro NO se restringe por línea: los históricos con lineaId NULL cuentan.
      expect(prisma.movimientoInventario.findMany.mock.calls[0][0].where.lineaId).toBeUndefined();
      expect(prisma.movimientoInventario.groupBy.mock.calls[0][0].where.lineaId).toBeUndefined();

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
      // Sin filtro: metas globales (lineaId NULL) y sin marca de línea en el response.
      expect(prisma.meta.findMany.mock.calls[0][0].where.lineaId).toBeNull();
      expect(rep.lineaId).toBeNull();
    });

    it('filtrado por línea: eventos por par, facturas por OP y kardex PT por la línea del movimiento', async () => {
      prisma.eventoTrazabilidad.findMany.mockResolvedValue([]);
      prisma.factura.findMany.mockResolvedValue([]);
      prisma.meta.findMany.mockResolvedValue([]);
      prisma.movimientoInventario.findMany.mockResolvedValue([
        { tipo: 'ENTRADA', motivo: 'PRODUCCION', cantidad: 10, createdAt: new Date('2026-06-02T08:00:00Z') },
      ]);
      prisma.movimientoInventario.groupBy.mockResolvedValue([
        { tipo: 'ENTRADA', _sum: { cantidad: 100 } },
        { tipo: 'SALIDA', _sum: { cantidad: 40 } },
      ]);

      const rep = await service.diario(2026, 6, 4);

      // La línea baja al where de cada consulta segmentable.
      expect(prisma.eventoTrazabilidad.findMany.mock.calls[0][0].where.par).toEqual({ lineaId: 4 });
      expect(prisma.factura.findMany.mock.calls[0][0].where.despacho).toEqual({ op: { lineaId: 4 } });
      expect(prisma.meta.findMany.mock.calls[0][0].where.lineaId).toBe(4);
      // El kardex PT se corta por la línea sellada en cada movimiento.
      expect(prisma.movimientoInventario.findMany.mock.calls[0][0].where.lineaId).toBe(4);
      expect(prisma.movimientoInventario.groupBy.mock.calls[0][0].where.lineaId).toBe(4);
      expect(rep.kardexPT[0].saldoInicial).toBe(60);
      const k2 = rep.kardexPT.find((f) => f.fecha === '2026-06-02')!;
      expect(k2.ingreso).toBe(10);
      expect(rep.lineaId).toBe(4);
    });
  });

  describe('guardarMetas', () => {
    it('crea la meta si no existe y actualiza si existe (upsert a mano)', async () => {
      prisma.meta.findFirst
        .mockResolvedValueOnce(null) // GUARNICION: no existe → create
        .mockResolvedValueOnce({ id: 77 }); // INYECCION: existe → update
      prisma.meta.findMany.mockResolvedValue([]);
      await service.guardarMetas(2026, 6, [
        { tipo: 'GUARNICION', valor: 20160 },
        { tipo: 'INYECCION', valor: 20160 },
      ]);
      expect(prisma.meta.create).toHaveBeenCalledWith({
        data: { anio: 2026, mes: 6, tipo: 'GUARNICION', valor: 20160, lineaId: null },
      });
      expect(prisma.meta.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { valor: 20160 },
      });
    });

    it('con línea guarda la meta de esa línea, no la global', async () => {
      prisma.meta.findFirst.mockResolvedValue(null);
      prisma.meta.findMany.mockResolvedValue([]);
      await service.guardarMetas(2026, 6, [{ tipo: 'INYECCION', valor: 5000 }], 4);
      expect(prisma.meta.findFirst).toHaveBeenCalledWith({
        where: { anio: 2026, mes: 6, tipo: 'INYECCION', lineaId: 4 },
      });
      expect(prisma.meta.create).toHaveBeenCalledWith({
        data: { anio: 2026, mes: 6, tipo: 'INYECCION', valor: 5000, lineaId: 4 },
      });
      expect(prisma.meta.findMany).toHaveBeenCalledWith({
        where: { anio: 2026, mes: 6, lineaId: 4 },
      });
    });
  });
});
