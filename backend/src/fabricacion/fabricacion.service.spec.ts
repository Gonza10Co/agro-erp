import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';

function makePrisma(overrides: any = {}) {
  const tx = {
    ordenFabricacion: {
      aggregate: jest.fn().mockResolvedValue({ _max: { consecutivo: 4 } }),
      create: jest.fn().mockResolvedValue({ id: 1, consecutivo: 5 }),
      update: jest.fn().mockResolvedValue({}),
    },
    par: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    eventoTrazabilidad: { create: jest.fn().mockResolvedValue({}) },
    bodega: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    inventarioPT: { upsert: jest.fn().mockResolvedValue({}) },
    ...overrides.tx,
  };
  const prisma: any = {
    ordenProduccion: {
      findUnique: jest.fn(),
    },
    par: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx };
}

describe('FabricacionService.generarOF', () => {
  it('crea OF con consecutivo max+1 y N pares en CORTE', async () => {
    const { prisma, tx } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 100,
      ordenesFabricacion: [],
      lineas: [
        {
          productoConfiguradoId: 10,
          tallas: [
            { tallaId: 1, cantAProducir: 2 },
            { tallaId: 2, cantAProducir: 1 },
          ],
        },
      ],
    });
    const service = new FabricacionService(prisma);

    const res = await service.generarOF(100);

    expect(tx.ordenFabricacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutivo: 5, opId: 100 }) }),
    );
    const createManyArg = tx.par.createMany.mock.calls[0][0];
    expect(createManyArg.data).toHaveLength(3);
    expect(createManyArg.data[0]).toMatchObject({ ofId: 1, codigo: 'OF5-0001' });
    expect(res).toEqual({ id: 1, consecutivo: 5, opId: 100, totalPares: 3 });
  });

  it('consecutivo = 1 cuando no hay OFs previas', async () => {
    const { prisma, tx } = makePrisma();
    tx.ordenFabricacion.aggregate.mockResolvedValue({ _max: { consecutivo: null } });
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 100, ordenesFabricacion: [],
      lineas: [{ productoConfiguradoId: 10, tallas: [{ tallaId: 1, cantAProducir: 1 }] }],
    });
    await new FabricacionService(prisma).generarOF(100);
    expect(tx.ordenFabricacion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ consecutivo: 1 }) }),
    );
  });

  it('404 si la OP no existe', async () => {
    const { prisma } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(new FabricacionService(prisma).generarOF(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si la OP ya tiene OF', async () => {
    const { prisma } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 1, ordenesFabricacion: [{ id: 1 }], lineas: [],
    });
    await expect(new FabricacionService(prisma).generarOF(1)).rejects.toBeInstanceOf(ConflictException);
  });

  it('400 si la OP no tiene producción pendiente', async () => {
    const { prisma } = makePrisma();
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 1, ordenesFabricacion: [],
      lineas: [{ productoConfiguradoId: 10, tallas: [{ tallaId: 1, cantAProducir: 0 }] }],
    });
    await expect(new FabricacionService(prisma).generarOF(1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
