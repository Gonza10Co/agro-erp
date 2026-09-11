import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma: any = {
    ordenCompra: { groupBy: jest.fn() },
    ordenFabricacion: { count: jest.fn() },
    par: { groupBy: jest.fn() },
    despacho: { count: jest.fn() },
    factura: { aggregate: jest.fn(), findMany: jest.fn() },
    cliente: { count: jest.fn() },
  };
  // El panel no cuenta la planta por su cuenta: le pide el resumen al tablero.
  const fabricacion: any = { tableroResumen: jest.fn() };
  const service = new DashboardService(prisma, fabricacion);
  beforeEach(() => jest.clearAllMocks());

  it('arma el resumen de KPIs', async () => {
    prisma.ordenCompra.groupBy.mockResolvedValue([
      { estado: 'BORRADOR', _count: { _all: 1 } },
      { estado: 'CONFIRMADA', _count: { _all: 2 } },
      { estado: 'EN_PRODUCCION', _count: { _all: 3 } },
      { estado: 'CERRADA', _count: { _all: 4 } },
    ]);
    prisma.ordenFabricacion.count.mockResolvedValue(2);
    fabricacion.tableroResumen.mockResolvedValue({
      estaciones: [
        { codigo: 'CORTE_PENDIENTE', nombre: 'Corte', total: 90, tallas: [] },
        { codigo: 'PREPARACION', nombre: 'Preparación', total: 6, tallas: [] },
        { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', total: 4, tallas: [] },
      ],
      terminados: 2,
      fueraDeFlujo: 1,
      total: 13,
      programado: 100,
    });
    prisma.despacho.count.mockResolvedValue(3);
    prisma.factura.aggregate.mockResolvedValue({ _sum: { total: 1000000 }, _count: { _all: 2 } });
    prisma.factura.findMany.mockResolvedValue([
      { total: 600000, fechaVencimiento: new Date('2026-05-01'), pagos: [{ monto: 100000 }] }, // saldo 500000, vencida
      { total: 300000, fechaVencimiento: new Date('2026-12-01'), pagos: [] }, // saldo 300000, al día
    ]);
    prisma.cliente.count.mockResolvedValue(1);

    const r = await service.resumen();

    expect(r.pedidos.porEstado).toEqual({ BORRADOR: 1, CONFIRMADA: 2, EN_PRODUCCION: 3, CERRADA: 4, ANULADA: 0 });
    expect(r.pedidos.enCurso).toBe(5); // CONFIRMADA + EN_PRODUCCION
    expect(r.produccion.ofActivas).toBe(2);
    // En proceso = lo que existe menos lo terminado y lo dado de baja.
    expect(r.produccion.paresEnProceso).toBe(10);
    expect(r.produccion.programado).toBe(100);
    // Las mismas columnas del tablero, para que las dos pantallas no se contradigan.
    expect(r.produccion.porEstacion).toEqual([
      { codigo: 'CORTE_PENDIENTE', nombre: 'Corte', pares: 90 },
      { codigo: 'PREPARACION', nombre: 'Preparación', pares: 6 },
      { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', pares: 4 },
    ]);
    expect(r.despachosMes).toBe(3);
    expect(r.facturacionMes).toEqual({ total: 1000000, count: 2 });
    expect(r.cartera.saldoTotal).toBe(800000);
    expect(r.cartera.saldoVencido).toBe(500000);
    expect(r.cartera.clientesVencidos).toBe(1);
  });

  it('facturación del mes en 0 cuando no hay facturas', async () => {
    prisma.ordenCompra.groupBy.mockResolvedValue([]);
    prisma.ordenFabricacion.count.mockResolvedValue(0);
    fabricacion.tableroResumen.mockResolvedValue({
      estaciones: [], terminados: 0, fueraDeFlujo: 0, total: 0, programado: 0,
    });
    prisma.despacho.count.mockResolvedValue(0);
    prisma.factura.aggregate.mockResolvedValue({ _sum: { total: null }, _count: { _all: 0 } });
    prisma.factura.findMany.mockResolvedValue([]);
    prisma.cliente.count.mockResolvedValue(0);

    const r = await service.resumen();
    expect(r.facturacionMes).toEqual({ total: 0, count: 0 });
    expect(r.cartera).toEqual({ saldoTotal: 0, saldoVencido: 0, clientesVencidos: 0 });
  });
});
