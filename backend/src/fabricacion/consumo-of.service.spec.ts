import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';

/**
 * El consumo real es el único punto del sistema que BAJA stock de materia prima,
 * y lo hace sobre el inventario real del cliente: estos specs cuidan que no
 * descuente de más, que no deje la reserva colgada y que no entregue lo que no hay.
 */
function makePrisma(overrides: any = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    inventarioMaterial: {
      findMany: jest.fn().mockResolvedValue([
        { materialId: 1, cantDisponible: 100, cantReservada: 30 },
      ]),
      update: jest.fn().mockResolvedValue({}),
    },
    material: {
      findMany: jest.fn().mockResolvedValue([
        { id: 1, codigo: 'CUERO-01', costoPromedio: 12.5, costoBase: 10 },
      ]),
    },
    requerimientoCompra: {
      findMany: jest.fn().mockResolvedValue([
        { id: 77, lineas: [{ id: 501, materialId: 1, cantReservada: 30 }] },
      ]),
    },
    requerimientoCompraLinea: { update: jest.fn().mockResolvedValue({}) },
    movimientoInventario: { create: jest.fn().mockResolvedValue({}) },
    ...overrides.tx,
  };
  const prisma: any = {
    ordenFabricacion: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 5, consecutivo: 31, estado: 'ABIERTA', opId: 9 }),
    },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx };
}

function makeService(prisma: any) {
  const bomLoader: any = { cargarEntrada: jest.fn() };
  const service = new FabricacionService(prisma, bomLoader);
  // registrarConsumo devuelve la tabla al final; acá solo interesan los efectos.
  jest.spyOn(service, 'consumoDeOf').mockResolvedValue({ ofId: 5 } as any);
  return { service, bomLoader };
}

const DTO = { lineas: [{ materialId: 1, cantidad: 25 }] };
const USER = { sub: 3 };

describe('FabricacionService.registrarConsumo', () => {
  it('baja el stock y deja el movimiento atado a la OF', async () => {
    const { prisma, tx } = makePrisma();
    const { service } = makeService(prisma);

    await service.registrarConsumo(5, DTO as any, USER);

    expect(tx.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: {
        cantDisponible: { decrement: 25 },
        cantReservada: { decrement: 25 },
      },
    });
    expect(tx.movimientoInventario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tipo: 'SALIDA',
        motivo: 'CONSUMO_PRODUCCION',
        materialId: 1,
        cantidad: 25,
        costoUnitario: 12.5,
        ofId: 5,
        referencia: 'OF-31',
        usuarioId: 3,
      }),
    });
  });

  it('descuenta lo consumido de la reserva del pedido, no solo del disponible', async () => {
    const { prisma, tx } = makePrisma();
    const { service } = makeService(prisma);

    await service.registrarConsumo(5, DTO as any, USER);

    // Sin esto, al cerrar la OP se liberarían 30 que ya se habían gastado y el
    // agregado de reservas quedaría negativo.
    expect(tx.requerimientoCompraLinea.update).toHaveBeenCalledWith({
      where: { id: 501 },
      data: { cantReservada: { decrement: 25 } },
    });
  });

  it('consumir más de lo reservado no deja la reserva negativa', async () => {
    const { prisma, tx } = makePrisma();
    const { service } = makeService(prisma);

    await service.registrarConsumo(5, { lineas: [{ materialId: 1, cantidad: 40 }] } as any, USER);

    expect(tx.requerimientoCompraLinea.update).toHaveBeenCalledWith({
      where: { id: 501 },
      data: { cantReservada: { decrement: 30 } }, // solo lo que estaba amarrado
    });
    expect(tx.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: {
        cantDisponible: { decrement: 40 },
        cantReservada: { decrement: 30 },
      },
    });
  });

  it('material sin reserva viva: baja el disponible y no toca la reserva', async () => {
    const { prisma, tx } = makePrisma({
      tx: { requerimientoCompra: { findMany: jest.fn().mockResolvedValue([]) } },
    });
    const { service } = makeService(prisma);

    await service.registrarConsumo(5, DTO as any, USER);

    expect(tx.requerimientoCompraLinea.update).not.toHaveBeenCalled();
    expect(tx.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: { cantDisponible: { decrement: 25 } },
    });
  });

  it('rechaza entregar más de lo que hay en bodega', async () => {
    const { prisma, tx } = makePrisma({
      tx: {
        inventarioMaterial: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ materialId: 1, cantDisponible: 10, cantReservada: 0 }]),
          update: jest.fn(),
        },
      },
    });
    const { service } = makeService(prisma);

    await expect(
      service.registrarConsumo(5, DTO as any, USER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.movimientoInventario.create).not.toHaveBeenCalled();
  });

  it('suma dos líneas del mismo material antes de tocar la bodega', async () => {
    const { prisma, tx } = makePrisma();
    const { service } = makeService(prisma);

    await service.registrarConsumo(
      5,
      { lineas: [{ materialId: 1, cantidad: 10 }, { materialId: 1, cantidad: 5 }] } as any,
      USER,
    );

    expect(tx.inventarioMaterial.update).toHaveBeenCalledTimes(1);
    expect(tx.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 1 },
      data: {
        cantDisponible: { decrement: 15 },
        cantReservada: { decrement: 15 },
      },
    });
  });

  it('una OF anulada no admite consumo', async () => {
    const { prisma, tx } = makePrisma({
      root: {
        ordenFabricacion: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 5, consecutivo: 31, estado: 'ANULADA', opId: 9 }),
        },
      },
    });
    const { service } = makeService(prisma);

    await expect(
      service.registrarConsumo(5, DTO as any, USER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.movimientoInventario.create).not.toHaveBeenCalled();
  });

  it('OF inexistente → 404', async () => {
    const { prisma } = makePrisma({
      root: { ordenFabricacion: { findUnique: jest.fn().mockResolvedValue(null) } },
    });
    const { service } = makeService(prisma);

    await expect(
      service.registrarConsumo(99, DTO as any, USER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FabricacionService.consumoDeOf', () => {
  function makeLectura() {
    const prisma: any = {
      ordenFabricacion: {
        findUnique: jest.fn().mockResolvedValue({ id: 5, consecutivo: 31 }),
      },
      par: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ productoConfiguradoId: 10, tallaId: 2, _count: 12 }]),
      },
      productoConfigurado: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 10, referenciaId: 1, marcaId: 1, opciones: [] }]),
      },
      talla: { findMany: jest.fn().mockResolvedValue([{ id: 2, valor: 38 }]) },
      movimientoInventario: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ materialId: 1, _sum: { cantidad: 30 } }]),
      },
      material: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, codigo: 'CUERO-01', nombreCanonico: 'Cuero', unidadMedida: { codigo: 'DM2' } },
        ]),
      },
    };
    const bomLoader: any = { cargarEntrada: jest.fn().mockResolvedValue({}) };
    const service = new FabricacionService(prisma, bomLoader);
    // El BOM pide 2 unidades por par → 12 pares = 24 teóricos.
    jest
      .spyOn(service as any, 'resolver')
      .mockReturnValue({ comprados: [{ materialId: 1, consumo: 2 }] });
    return { service, prisma };
  }

  it('multiplica el BOM por los pares de la OF y lo cruza contra el kardex', async () => {
    const { service } = makeLectura();

    const r = await service.consumoDeOf(5);

    expect(r.consecutivo).toBe(31);
    expect(r.lineas).toEqual([
      {
        materialId: 1,
        teorico: 24,
        entregado: 30,
        diferencia: 6,
        materialCodigo: 'CUERO-01',
        materialNombre: 'Cuero',
        unidad: 'DM2',
      },
    ]);
  });

  it('los pares cancelados no suman al teórico', async () => {
    const { service, prisma } = makeLectura();

    await service.consumoDeOf(5);

    expect(prisma.par.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ofId: 5, estado: { not: 'CANCELADO' } } }),
    );
  });
});
