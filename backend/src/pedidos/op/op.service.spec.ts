import { BadRequestException } from '@nestjs/common';
import { OpService } from './op.service';

// ComprasService espiable: generarDesdeOC dispara el requerimiento automático.
let compras: any;
beforeEach(() => {
  compras = { calcularRequerimiento: jest.fn().mockResolvedValue({ id: 900 }) };
});

function makeTx() {
  return {
    $queryRawUnsafe: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    ordenProduccion: {
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
    const service = new OpService(prisma, compras);
    await expect(service.generarDesdeOC(1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('la OP hereda la línea de producción de la OC (línea por pedido)', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({
      id: 1,
      estado: 'CONFIRMADA',
      lineaId: 4,
      lineas: [],
    });
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 801n }]);
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccion.findUnique.mockResolvedValue({ id: 50, estado: 'AMARRADA' });

    await new OpService(prisma, compras).generarDesdeOC(1);

    expect(tx.ordenProduccion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lineaId: 4 }) }),
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
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 801n }]);
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

    const service = new OpService(prisma, compras);
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

  describe('venta de SEGUNDAS', () => {
    function ocDeSegundas(cantidad = 100) {
      return {
        id: 1,
        estado: 'CONFIRMADA',
        lineas: [
          {
            id: 11,
            productoConfiguradoId: 2,
            calidad: 'SEGUNDA',
            tallas: [{ tallaId: 5, cantidad }],
          },
        ],
      };
    }

    it('amarra del saldo de SEGUNDA, no del de primeras', async () => {
      prisma.ordenCompra.findUnique.mockResolvedValue(ocDeSegundas());
      tx.$queryRawUnsafe.mockResolvedValue([{ v: 802n }]);
      tx.ordenProduccion.create.mockResolvedValue({ id: 51 });
      tx.ordenProduccionLinea.create.mockResolvedValue({ id: 61 });
      tx.inventarioPT.findMany.mockResolvedValue([]);
      tx.ordenProduccionLineaTalla.create.mockResolvedValue({ id: 81 });
      tx.ordenProduccion.findUnique.mockResolvedValue({ id: 51, estado: 'AMARRADA' });

      await new OpService(prisma, compras).generarDesdeOC(1);

      // La consulta de stock se acota al grado pedido.
      expect(tx.inventarioPT.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ calidad: 'SEGUNDA' }),
        }),
      );
      // Y la OP hereda el grado, para que el despacho descargue de ese saldo.
      expect(tx.ordenProduccionLinea.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ calidad: 'SEGUNDA' }) }),
      );
    });

    it('NO manda a producir lo que falte: las segundas no se fabrican a pedido', async () => {
      prisma.ordenCompra.findUnique.mockResolvedValue(ocDeSegundas(100));
      tx.$queryRawUnsafe.mockResolvedValue([{ v: 803n }]);
      tx.ordenProduccion.create.mockResolvedValue({ id: 52 });
      tx.ordenProduccionLinea.create.mockResolvedValue({ id: 62 });
      // Solo hay 30 segundas en bodega para un pedido de 100.
      tx.inventarioPT.findMany.mockResolvedValue([
        { id: 71, bodegaId: 1, cantDisponible: 30, cantReservada: 0, bodega: { prioridad: 100 } },
      ]);
      tx.ordenProduccionLineaTalla.create.mockResolvedValue({ id: 82 });
      tx.ordenProduccion.findUnique.mockResolvedValue({ id: 52, estado: 'AMARRADA' });

      await new OpService(prisma, compras).generarDesdeOC(1);

      expect(tx.ordenProduccionLineaTalla.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cantPedida: 100,
            cantAmarrada: 30,
            cantAProducir: 0, // ← lo que falta NO se fabrica
          }),
        }),
      );
    });
  });

  it('bloquea las filas de InventarioPT (FOR UPDATE) antes de leer disponibilidad', async () => {
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
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 801n }]);
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccionLinea.create.mockResolvedValue({ id: 60 });
    tx.inventarioPT.findMany.mockResolvedValue([]);
    tx.ordenProduccionLineaTalla.create.mockResolvedValue({ id: 80 });
    tx.ordenProduccion.findUnique.mockResolvedValue({ id: 50, estado: 'AMARRADA' });

    const svc = new OpService(prisma, compras);
    await svc.generarDesdeOC(1);

    expect(tx.$queryRaw).toHaveBeenCalled();
    const sql = (tx.$queryRaw as jest.Mock).mock.calls[0][0].join('?');
    expect(sql).toContain('FOR UPDATE');
  });

  it('con producción pendiente dispara el requerimiento automático (amarre de insumos)', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'CONFIRMADA', lineas: [] });
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 801n }]);
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccion.findUnique.mockResolvedValue({
      id: 50,
      estado: 'AMARRADA',
      lineas: [{ tallas: [{ cantAProducir: 70 }] }],
    });

    const r = await new OpService(prisma, compras).generarDesdeOC(1);

    expect(compras.calcularRequerimiento).toHaveBeenCalledWith(50);
    expect(r.requerimientoId).toBe(900);
  });

  it('si todo quedó amarrado de PT no genera requerimiento (nada que producir)', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'CONFIRMADA', lineas: [] });
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 801n }]);
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccion.findUnique.mockResolvedValue({
      id: 50,
      estado: 'AMARRADA',
      lineas: [{ tallas: [{ cantAProducir: 0 }] }],
    });

    const r = await new OpService(prisma, compras).generarDesdeOC(1);

    expect(compras.calcularRequerimiento).not.toHaveBeenCalled();
    expect(r.requerimientoId).toBeNull();
  });

  it('si el requerimiento automático falla (BOM incompleto) la OP queda creada igual', async () => {
    prisma.ordenCompra.findUnique.mockResolvedValue({ id: 1, estado: 'CONFIRMADA', lineas: [] });
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 801n }]);
    tx.ordenProduccion.create.mockResolvedValue({ id: 50 });
    tx.ordenProduccion.findUnique.mockResolvedValue({
      id: 50,
      estado: 'AMARRADA',
      lineas: [{ tallas: [{ cantAProducir: 70 }] }],
    });
    compras.calcularRequerimiento.mockRejectedValue(new Error('BOM incompleto'));

    const r = await new OpService(prisma, compras).generarDesdeOC(1);

    expect(r.id).toBe(50);
    expect(r.requerimientoId).toBeNull();
  });
});

describe('OpService.anular', () => {
  it('devuelve las reservas al inventario y deja la OC CONFIRMADA', async () => {
    const tx = {
      inventarioPT: { update: jest.fn() },
      reservaInventarioPT: { deleteMany: jest.fn() },
      ordenProduccion: { update: jest.fn() },
      ordenCompra: { update: jest.fn() },
      par: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ordenFabricacion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      requerimientoCompra: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      inventarioMaterial: { update: jest.fn() },
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
    const service = new OpService(prisma, compras);
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

  it('al anular cancela los pares en proceso y anula las OFs de la OP', async () => {
    const tx = {
      inventarioPT: { update: jest.fn() },
      reservaInventarioPT: { deleteMany: jest.fn() },
      ordenProduccion: { update: jest.fn() },
      ordenCompra: { update: jest.fn() },
      par: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ordenFabricacion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      requerimientoCompra: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      inventarioMaterial: { update: jest.fn() },
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
    const service = new OpService(prisma, compras);
    await service.anular(50);
    expect(tx.par.updateMany).toHaveBeenCalledWith({
      where: { of: { opId: 50 }, estado: 'EN_PROCESO' },
      data: { estado: 'CANCELADO' },
    });
    expect(tx.ordenFabricacion.updateMany).toHaveBeenCalledWith({
      where: { opId: 50, estado: { in: ['ABIERTA', 'EN_PROCESO'] } },
      data: { estado: 'ANULADA' },
    });
  });

  it('al anular NO toca pares DADO_DE_BAJA (solo cancela EN_PROCESO)', async () => {
    const tx = {
      inventarioPT: { update: jest.fn() },
      reservaInventarioPT: { deleteMany: jest.fn() },
      ordenProduccion: { update: jest.fn() },
      ordenCompra: { update: jest.fn() },
      par: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ordenFabricacion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      requerimientoCompra: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      inventarioMaterial: { update: jest.fn() },
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
    const service = new OpService(prisma, compras);
    await service.anular(50);
    expect(tx.par.updateMany).toHaveBeenCalledWith({
      where: { of: { opId: 50 }, estado: 'EN_PROCESO' },
      data: { estado: 'CANCELADO' },
    });
  });

  it('al anular libera el amarre de insumos (requerimientos con reserva activa)', async () => {
    const tx = {
      inventarioPT: { update: jest.fn() },
      reservaInventarioPT: { deleteMany: jest.fn() },
      ordenProduccion: { update: jest.fn() },
      ordenCompra: { update: jest.fn() },
      par: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      ordenFabricacion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      requerimientoCompra: {
        findMany: jest.fn().mockResolvedValue([
          { id: 7, lineas: [{ materialId: 3, cantReservada: 40 }, { materialId: 4, cantReservada: 0 }] },
        ]),
        update: jest.fn(),
      },
      inventarioMaterial: { update: jest.fn() },
    };
    const prisma: any = {
      ordenProduccion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 50, ocId: 1, estado: 'AMARRADA',
          lineas: [{ tallas: [{ id: 80, reservas: [] }] }],
        }),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    await new OpService(prisma, compras).anular(50);
    // Solo busca reservas ACTIVAS de esa OP y las devuelve al neto disponible.
    expect(tx.requerimientoCompra.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { opId: 50, reservaActiva: true } }),
    );
    expect(tx.inventarioMaterial.update).toHaveBeenCalledTimes(1); // la línea en 0 no se toca
    expect(tx.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 3 },
      data: { cantReservada: { decrement: 40 } },
    });
    expect(tx.requerimientoCompra.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { reservaActiva: false },
    });
  });
});

describe('OpService lectura', () => {
  it('listar ordena por consecutivo desc', async () => {
    const prisma: any = {
      ordenProduccion: { findMany: jest.fn().mockResolvedValue([{ id: 2 }, { id: 1 }]) },
    };
    const service = new OpService(prisma, compras);
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
    const service = new OpService(prisma, compras);
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
    const service = new OpService(prisma, compras);
    const r = await service.obtener(50);
    expect(r).toMatchObject({ id: 50, estado: 'AMARRADA' });
  });
});
