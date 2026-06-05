import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DespachoService } from './despacho.service';

function opBase(over: any = {}) {
  return {
    id: 1, ocId: 9, estado: 'AMARRADA', despacho: null,
    oc: { cliente: { estadoCartera: 'AL_DIA' } },
    lineas: [
      { productoConfiguradoId: 7, tallas: [
        { tallaId: 10, cantAProducir: 0, reservas: [
          { id: 100, inventarioPTId: 50, cantidad: 5, inventarioPT: { bodegaId: 2 } },
        ] },
      ] },
    ],
    ...over,
  };
}

describe('DespachoService', () => {
  const prisma: any = {
    ordenProduccion: { findUnique: jest.fn(), update: jest.fn() },
    despacho: { aggregate: jest.fn(), create: jest.fn() },
    inventarioPT: { update: jest.fn() },
    reservaInventarioPT: { delete: jest.fn() },
    ordenCompra: { update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new DespachoService(prisma);
  const gerente = { sub: 3, role: 'GERENTE' };
  const operario = { sub: 4, role: 'OPERARIO' };
  beforeEach(() => jest.clearAllMocks());

  it('404 si la OP no existe', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(NotFoundException);
  });

  it('409 si la OP ya tiene despacho', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ despacho: { id: 1 } }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si la OP no está amarrada', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ estado: 'CREADA' }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si la OP tiene producción pendiente (cantAProducir > 0)', async () => {
    const op = opBase();
    op.lineas[0].tallas[0].cantAProducir = 2;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si cartera VENCIDO y no se autoriza', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(ConflictException);
  });

  it('403 si autoriza pero no es gerente', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    await expect(service.despachar({ opId: 1, autorizar: true }, operario)).rejects.toThrow(ForbiddenException);
  });

  it('AL_DIA: descuenta inventario, borra reservas, crea despacho, cambia estados', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    prisma.despacho.aggregate.mockResolvedValue({ _max: { consecutivo: 4 } });
    prisma.despacho.create.mockResolvedValue({ id: 1, consecutivo: 5 });
    await service.despachar({ opId: 1 }, operario);
    expect(prisma.inventarioPT.update).toHaveBeenCalledWith({ where: { id: 50 }, data: { cantDisponible: { decrement: 5 }, cantReservada: { decrement: 5 } } });
    expect(prisma.reservaInventarioPT.delete).toHaveBeenCalledWith({ where: { id: 100 } });
    const createArg = prisma.despacho.create.mock.calls[0][0];
    expect(createArg.data.consecutivo).toBe(5);
    expect(createArg.data.opId).toBe(1);
    expect(createArg.data.autorizadoPorId).toBeNull();
    expect(createArg.data.lineas.create).toEqual([{ productoConfiguradoId: 7, tallaId: 10, bodegaId: 2, cantidad: 5 }]);
    expect(prisma.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'DESPACHADA' } });
    expect(prisma.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { estado: 'CERRADA' } });
  });

  it('VENCIDO + gerente autoriza: registra autorizadoPor y motivo', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    prisma.despacho.aggregate.mockResolvedValue({ _max: { consecutivo: 0 } });
    prisma.despacho.create.mockResolvedValue({ id: 2, consecutivo: 1 });
    await service.despachar({ opId: 1, autorizar: true, motivo: 'urgente' }, gerente);
    const createArg = prisma.despacho.create.mock.calls[0][0];
    expect(createArg.data.autorizadoPorId).toBe(3);
    expect(createArg.data.motivoAutorizacion).toBe('urgente');
  });
});
