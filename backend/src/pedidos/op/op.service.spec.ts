import { BadRequestException } from '@nestjs/common';
import { OpService } from './op.service';

function makeTx() {
  return {
    ordenProduccion: {
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    ordenProduccionLinea: { create: jest.fn() },
    ordenProduccionLineaTalla: { create: jest.fn() },
    inventarioPT: { findMany: jest.fn(), update: jest.fn() },
    reservaInventarioPT: { create: jest.fn() },
    ordenCompra: { update: jest.fn() },
  };
}

describe('OpService.generarDesdeOC', () => {
  let prisma: any;
  let tx: ReturnType<typeof makeTx>;
  beforeEach(() => {
    tx = makeTx();
    prisma = {
      ordenCompra: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
  });

  it('rechaza si la OC no está CONFIRMADA', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'BORRADOR',
      lineas: [],
    });
    const service = new OpService(prisma);
    await expect(service.generarDesdeOC(1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('amarra stock disponible y reserva; calcula a producir', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'CONFIRMADA',
      lineas: [
        {
          id: 11,
          productoConfiguradoId: 2,
          tallas: [{ tallaId: 5, cantidad: 100 }],
        },
      ],
    });
    tx.ordenProduccion.aggregate.mockResolvedValue({
      _max: { consecutivo: 800 },
    });
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccionLinea.create.mockResolvedValue({ id: 60 });
    tx.inventarioPT.findMany.mockResolvedValue([
      {
        id: 70,
        bodegaId: 1,
        cantDisponible: 30,
        cantReservada: 0,
        bodega: { prioridad: 100 },
      },
    ]);
    tx.ordenProduccionLineaTalla.create.mockResolvedValue({ id: 80 });
    tx.ordenProduccion.findUnique.mockResolvedValue({
      id: 50,
      estado: 'AMARRADA',
    });

    const service = new OpService(prisma);
    await service.generarDesdeOC(1);

    expect(tx.ordenProduccion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          consecutivo: 801,
          ocId: 1,
          estado: 'CREADA',
        }),
      }),
    );
    expect(tx.ordenProduccionLineaTalla.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tallaId: 5,
          cantPedida: 100,
          cantAmarrada: 30,
          cantAProducir: 70,
        }),
      }),
    );
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({
      where: { id: 70 },
      data: { cantReservada: { increment: 30 } },
    });
    expect(tx.reservaInventarioPT.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ inventarioPTId: 70, cantidad: 30 }),
      }),
    );
    expect(tx.ordenProduccion.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { estado: 'AMARRADA' },
    });
    expect(tx.ordenCompra.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { estado: 'EN_PRODUCCION' },
    });
  });
});

describe('OpService.anular', () => {
  it('devuelve las reservas al inventario y deja la OC CONFIRMADA', async () => {
    const tx = {
      inventarioPT: { update: jest.fn() },
      reservaInventarioPT: { deleteMany: jest.fn() },
      ordenProduccion: { update: jest.fn() },
      ordenCompra: { update: jest.fn() },
    };
    const prisma: any = {
      ordenProduccion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 50,
          ocId: 1,
          estado: 'AMARRADA',
          lineas: [
            {
              tallas: [
                { id: 80, reservas: [{ inventarioPTId: 70, cantidad: 30 }] },
              ],
            },
          ],
        }),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    const service = new OpService(prisma);
    await service.anular(50);
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({
      where: { id: 70 },
      data: { cantReservada: { decrement: 30 } },
    });
    expect(tx.reservaInventarioPT.deleteMany).toHaveBeenCalledWith({
      where: { opLineaTallaId: 80 },
    });
    expect(tx.ordenProduccion.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { estado: 'ANULADA' },
    });
    expect(tx.ordenCompra.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { estado: 'CONFIRMADA' },
    });
  });
});

describe('OpService lectura', () => {
  it('listar ordena por consecutivo desc', async () => {
    const prisma: any = {
      ordenProduccion: { findMany: jest.fn().mockResolvedValue([{ id: 2 }, { id: 1 }]) },
    };
    const service = new OpService(prisma);
    const r = await service.listar();
    expect(prisma.ordenProduccion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { consecutivo: 'desc' } }),
    );
    expect(r).toHaveLength(2);
  });

  it('obtener lanza NotFound si la OP no existe', async () => {
    const prisma: any = {
      ordenProduccion: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new OpService(prisma);
    await expect(service.obtener(99)).rejects.toThrow('OP 99 no existe');
  });

  it('obtener devuelve la OP con el desglose de amarre', async () => {
    const prisma: any = {
      ordenProduccion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 50,
          estado: 'AMARRADA',
          lineas: [{ tallas: [{ cantPedida: 100, cantAmarrada: 30, cantAProducir: 70, reservas: [] }] }],
        }),
      },
    };
    const service = new OpService(prisma);
    const r = await service.obtener(50);
    expect(r).toMatchObject({ id: 50, estado: 'AMARRADA' });
  });
});
