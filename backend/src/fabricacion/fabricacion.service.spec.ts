import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';

const BODEGA_ID = 7;

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
    inventarioPT: { upsert: jest.fn().mockResolvedValue({}) },
    ...overrides.tx,
  };
  const prisma: any = {
    ordenProduccion: {
      findUnique: jest.fn(),
    },
    par: { findUnique: jest.fn() },
    // La bodega destino se resuelve fuera de la transacción (config global).
    bodega: { findFirst: jest.fn().mockResolvedValue({ id: BODEGA_ID }) },
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

describe('FabricacionService.avanzar', () => {
  const dto = { operarioId: 3, maquinaId: 4 };

  it('registra evento en la célula actual y mueve a la siguiente', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'CORTE', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' },
    });
    tx.par.update.mockResolvedValue({ id: 50, celulaActual: 'GUARNICION' });
    const service = new FabricacionService(prisma);

    await service.avanzar('OF1-0001', dto);

    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parId: 50, celula: 'CORTE', operarioId: 3, maquinaId: 4 }),
      }),
    );
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION' }) }),
    );
  });

  it('al salir de CORTE pasa la OF de ABIERTA a EN_PROCESO', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'CORTE', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.ordenFabricacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'EN_PROCESO' } }),
    );
  });

  it('desde PT termina el par y suma 1 a InventarioPT', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    tx.par.count.mockResolvedValue(0); // era el último par en proceso
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);

    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'TERMINADO' } }),
    );
    expect(tx.inventarioPT.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productoConfiguradoId_tallaId_bodegaId: { productoConfiguradoId: 10, tallaId: 1, bodegaId: BODEGA_ID } },
        create: expect.objectContaining({ cantDisponible: 1 }),
        update: { cantDisponible: { increment: 1 } },
      }),
    );
    expect(tx.ordenFabricacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'TERMINADA' } }),
    );
  });

  it('avance desde célula intermedia no toca el estado de la OF', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 51, ofId: 1, celulaActual: 'GUARNICION', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0002', dto);
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'ALMACEN' }) }),
    );
    expect(tx.ordenFabricacion.update).not.toHaveBeenCalled();
  });

  it('desde PT no cierra la OF si quedan pares en proceso', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    tx.par.count.mockResolvedValue(3); // todavía quedan pares
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.inventarioPT.upsert).toHaveBeenCalled();
    expect(tx.ordenFabricacion.update).not.toHaveBeenCalled();
  });

  it('404 si el par no existe', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(null);
    await expect(new FabricacionService(prisma).avanzar('NOPE', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el par ya está TERMINADO', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'TERMINADO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await expect(new FabricacionService(prisma).avanzar('OF1-0001', dto)).rejects.toBeInstanceOf(ConflictException);
  });
});
