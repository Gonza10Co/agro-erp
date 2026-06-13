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
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new FacturaService(prisma);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.factura.findMany.mockResolvedValue([]);
    prisma.cliente.findUnique.mockResolvedValue({ estadoCartera: 'AL_DIA' });
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
