import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CarteraService } from './cartera.service';

function facturaBase(over: any = {}) {
  return {
    id: 1,
    total: 1000000,
    pagos: [{ monto: 200000 }],
    despacho: { op: { oc: { clienteId: 7 } } },
    ...over,
  };
}

describe('CarteraService', () => {
  const prisma: any = {
    factura: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    pago: { create: jest.fn() },
    cliente: { findUnique: jest.fn().mockResolvedValue({ estadoCartera: 'AL_DIA' }), update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new CarteraService(prisma);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.factura.findMany.mockResolvedValue([]);
    prisma.cliente.findUnique.mockResolvedValue({ estadoCartera: 'AL_DIA' });
  });

  describe('registrarPago', () => {
    it('404 si la factura no existe', async () => {
      prisma.factura.findUnique.mockResolvedValue(null);
      await expect(service.registrarPago({ facturaId: 9, monto: 100 })).rejects.toThrow(NotFoundException);
    });

    it('400 si el monto es 0 o negativo', async () => {
      prisma.factura.findUnique.mockResolvedValue(facturaBase());
      await expect(service.registrarPago({ facturaId: 1, monto: 0 })).rejects.toThrow(BadRequestException);
    });

    it('400 si el monto supera el saldo', async () => {
      prisma.factura.findUnique.mockResolvedValue(facturaBase()); // saldo = 800000
      await expect(service.registrarPago({ facturaId: 1, monto: 900000 })).rejects.toThrow(BadRequestException);
    });

    it('crea el pago, recalcula la cartera y devuelve el saldo nuevo', async () => {
      prisma.factura.findUnique.mockResolvedValue(facturaBase()); // saldo actual = 800000
      prisma.pago.create.mockResolvedValue({ id: 5 });
      const res = await service.registrarPago({ facturaId: 1, monto: 300000, medio: 'transferencia' });

      const arg = prisma.pago.create.mock.calls[0][0];
      expect(arg.data).toEqual(expect.objectContaining({ facturaId: 1, monto: 300000, medio: 'transferencia' }));
      expect(prisma.cliente.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
      expect(res.saldo).toBe(500000);
    });

    it('permite saldar exactamente la factura', async () => {
      prisma.factura.findUnique.mockResolvedValue(facturaBase()); // saldo = 800000
      prisma.pago.create.mockResolvedValue({ id: 6 });
      const res = await service.registrarPago({ facturaId: 1, monto: 800000 });
      expect(res.saldo).toBe(0);
    });
  });
});
