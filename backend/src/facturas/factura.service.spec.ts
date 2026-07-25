import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FacturaService } from './factura.service';

function despachoBase(over: any = {}) {
  return {
    id: 1,
    factura: null,
    lineas: [
      { productoConfiguradoId: 10, tallaId: 38, cantidad: 3 },
      { productoConfiguradoId: 10, tallaId: 40, cantidad: 2 },
    ],
    op: {
      oc: {
        clienteId: 7,
        cliente: { id: 7, tipoCredito: 'D30', estadoCartera: 'AL_DIA' },
        lineas: [{ productoConfiguradoId: 10, precioUnitario: 85000 }],
      },
    },
    ...over,
  };
}

describe('FacturaService', () => {
  const prisma: any = {
    $queryRawUnsafe: jest.fn(),
    despacho: { findUnique: jest.fn() },
    factura: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    cliente: { findUnique: jest.fn().mockResolvedValue({ estadoCartera: 'AL_DIA' }), update: jest.fn() },
    linea: { findUnique: jest.fn().mockResolvedValue({ activo: true }) },
    servicioCatalogo: { findMany: jest.fn().mockResolvedValue([]) },
    eventoTrazabilidad: { count: jest.fn().mockResolvedValue(0) },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new FacturaService(prisma);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.factura.findMany.mockResolvedValue([]);
    prisma.cliente.findUnique.mockResolvedValue({ estadoCartera: 'AL_DIA' });
    prisma.linea.findUnique.mockResolvedValue({ activo: true });
    prisma.servicioCatalogo.findMany.mockResolvedValue([]);
  });

  // ── Factura de SERVICIO (maquila Feroz / mantenimiento) ──
  describe('facturarServicio', () => {
    const dtoBase = {
      clienteId: 7,
      lineaId: 4,
      lineas: [{ servicioId: 1, cantidad: 2016, precioUnitario: 4200 }],
    };

    function prepararOk() {
      prisma.cliente.findUnique.mockResolvedValue({ id: 7, tipoCredito: 'D30', activo: true });
      prisma.servicioCatalogo.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.$queryRawUnsafe.mockResolvedValue([{ v: 42n }]);
      prisma.factura.create.mockResolvedValue({ id: 5, consecutivo: 42 });
    }

    it('crea una factura SERVICIO sin despacho, con cliente y línea', async () => {
      prepararOk();
      await service.facturarServicio(dtoBase as any);

      const arg = prisma.factura.create.mock.calls[0][0];
      expect(arg.data.tipo).toBe('SERVICIO');
      expect(arg.data.despachoId).toBeNull();
      expect(arg.data.clienteId).toBe(7);
      expect(arg.data.lineaId).toBe(4);
      // Mismo consecutivo que las de producto: la numeración no se parte.
      expect(arg.data.consecutivo).toBe(42);
      // 2016 × 4200 = 8.467.200 + IVA 19%
      expect(Number(arg.data.subtotal)).toBe(8467200);
      expect(Number(arg.data.total)).toBe(10075968);
      expect(arg.data.lineas.create[0]).toMatchObject({ servicioId: 1, cantidad: 2016 });
    });

    it('entra a cartera como cualquier CxC (vencimiento por tipo de crédito)', async () => {
      prepararOk();
      await service.facturarServicio(dtoBase as any);
      const arg = prisma.factura.create.mock.calls[0][0];
      const dias = (arg.data.fechaVencimiento.getTime() - arg.data.fecha.getTime()) / 86400000;
      expect(Math.round(dias)).toBe(30);
      expect(prisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 7 } }),
      );
    });

    it('404 si el cliente no existe y 400 si está inactivo', async () => {
      prisma.cliente.findUnique.mockResolvedValue(null);
      await expect(service.facturarServicio(dtoBase as any)).rejects.toThrow(NotFoundException);
      prisma.cliente.findUnique.mockResolvedValue({ id: 7, tipoCredito: 'D30', activo: false });
      await expect(service.facturarServicio(dtoBase as any)).rejects.toThrow(BadRequestException);
    });

    it('400 si un servicio del catálogo no existe o está inactivo', async () => {
      prisma.cliente.findUnique.mockResolvedValue({ id: 7, tipoCredito: 'D30', activo: true });
      prisma.servicioCatalogo.findMany.mockResolvedValue([]); // ninguno vivo
      await expect(service.facturarServicio(dtoBase as any)).rejects.toThrow(BadRequestException);
    });

    it('400 si una línea no se puede nombrar (sin servicio ni descripción)', async () => {
      prisma.cliente.findUnique.mockResolvedValue({ id: 7, tipoCredito: 'D30', activo: true });
      await expect(
        service.facturarServicio({
          clienteId: 7,
          lineas: [{ cantidad: 1, precioUnitario: 100 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('acepta líneas de descripción libre, sin catálogo', async () => {
      prisma.cliente.findUnique.mockResolvedValue({ id: 7, tipoCredito: 'CONTADO', activo: true });
      prisma.$queryRawUnsafe.mockResolvedValue([{ v: 43n }]);
      prisma.factura.create.mockResolvedValue({ id: 6, consecutivo: 43 });
      await service.facturarServicio({
        clienteId: 7,
        lineas: [{ descripcion: 'Mantenimiento de inyectora', cantidad: 1, precioUnitario: 350000 }],
      } as any);
      const arg = prisma.factura.create.mock.calls[0][0];
      expect(arg.data.lineas.create[0]).toMatchObject({
        servicioId: null,
        descripcion: 'Mantenimiento de inyectora',
      });
      // Sin línea de producción declarada, el ingreso queda global.
      expect(arg.data.lineaId).toBeNull();
    });
  });

  describe('sugerenciaServicio', () => {
    it('cuenta los pares que la línea llevó a PT en el mes', async () => {
      prisma.linea.findUnique.mockResolvedValue({ id: 4, codigo: 'FEROZ', nombre: 'Feroz' });
      prisma.eventoTrazabilidad.count.mockResolvedValue(2016);
      const r = await service.sugerenciaServicio(4, 2026, 7);
      expect(r.paresTerminados).toBe(2016);
      const where = prisma.eventoTrazabilidad.count.mock.calls[0][0].where;
      expect(where.celula).toBe('PT');
      expect(where.par).toEqual({ lineaId: 4 });
      // Rango del mes: [1-jul, 1-ago)
      expect(where.timestamp.gte.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(where.timestamp.lt.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });

    it('404 si la línea no existe', async () => {
      prisma.linea.findUnique.mockResolvedValue(null);
      await expect(service.sugerenciaServicio(99, 2026, 7)).rejects.toThrow(NotFoundException);
    });
  });

  it('404 si el despacho no existe', async () => {
    prisma.despacho.findUnique.mockResolvedValue(null);
    await expect(service.facturar({ despachoId: 9 })).rejects.toThrow(NotFoundException);
  });

  it('400 si el despacho ya fue facturado', async () => {
    prisma.despacho.findUnique.mockResolvedValue(despachoBase({ factura: { id: 1 } }));
    await expect(service.facturar({ despachoId: 1 })).rejects.toThrow(BadRequestException);
  });

  it('400 si un producto despachado no tiene precio pactado en la OC', async () => {
    prisma.despacho.findUnique.mockResolvedValue(
      despachoBase({ op: { oc: { lineas: [{ productoConfiguradoId: 10, precioUnitario: null }] } } }),
    );
    await expect(service.facturar({ despachoId: 1 })).rejects.toThrow(BadRequestException);
  });

  it('crea factura EMITIDA con consecutivo, líneas y totales (IVA 19 por defecto)', async () => {
    prisma.despacho.findUnique.mockResolvedValue(despachoBase());
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 7n }]);
    prisma.factura.create.mockResolvedValue({ id: 1, consecutivo: 7 });

    await service.facturar({ despachoId: 1 });

    const arg = prisma.factura.create.mock.calls[0][0];
    expect(arg.data.consecutivo).toBe(7);
    expect(arg.data.despachoId).toBe(1);
    expect(Number(arg.data.ivaPct)).toBe(19);
    // 3*85000 + 2*85000 = 425000 ; IVA 19% = 80750 ; total 505750
    expect(Number(arg.data.subtotal)).toBe(425000);
    expect(Number(arg.data.iva)).toBe(80750);
    expect(Number(arg.data.total)).toBe(505750);
    expect(arg.data.lineas.create).toEqual([
      { productoConfiguradoId: 10, tallaId: 38, cantidad: 3, precioUnitario: 85000, subtotal: 255000 },
      { productoConfiguradoId: 10, tallaId: 40, cantidad: 2, precioUnitario: 85000, subtotal: 170000 },
    ]);
  });

  it('setea fechaVencimiento (D30 = fecha + 30 días) y recalcula la cartera del cliente', async () => {
    prisma.despacho.findUnique.mockResolvedValue(despachoBase());
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 7n }]);
    prisma.factura.create.mockResolvedValue({ id: 1, consecutivo: 7 });

    await service.facturar({ despachoId: 1 });

    const arg = prisma.factura.create.mock.calls[0][0];
    const dias = (arg.data.fechaVencimiento.getTime() - arg.data.fecha.getTime()) / 86400000;
    expect(Math.round(dias)).toBe(30);
    // recálculo de cartera: consulta facturas del cliente y actualiza el estado
    expect(prisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 } }),
    );
  });

  it('respeta un ivaPct distinto', async () => {
    prisma.despacho.findUnique.mockResolvedValue(despachoBase());
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 8n }]);
    prisma.factura.create.mockResolvedValue({ id: 2, consecutivo: 8 });
    await service.facturar({ despachoId: 1, ivaPct: 0 });
    const arg = prisma.factura.create.mock.calls[0][0];
    expect(Number(arg.data.iva)).toBe(0);
    expect(Number(arg.data.total)).toBe(425000);
  });
});
