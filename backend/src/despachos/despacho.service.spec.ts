import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DespachoService } from './despacho.service';

function opBase(over: any = {}) {
  return {
    id: 1, ocId: 9, estado: 'AMARRADA', despacho: null, lineaId: 3,
    oc: { cliente: { estadoCartera: 'AL_DIA' } },
    lineas: [
      { productoConfiguradoId: 7, tallas: [
        { id: 30, tallaId: 10, cantAProducir: 0, reservas: [
          { id: 100, inventarioPTId: 50, cantidad: 5, inventarioPT: { bodegaId: 2 } },
        ] },
      ] },
    ],
    ...over,
  };
}

describe('DespachoService', () => {
  const prisma: any = {
    $queryRawUnsafe: jest.fn(),
    ordenProduccion: { findUnique: jest.fn(), update: jest.fn() },
    despacho: { create: jest.fn() },
    inventarioPT: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    reservaInventarioPT: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
    ordenCompra: { update: jest.fn() },
    movimientoInventario: { createMany: jest.fn() },
    requerimientoCompra: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    inventarioMaterial: { update: jest.fn() },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const service = new DespachoService(prisma);
  const gerente = { sub: 3, role: 'GERENTE' };
  const operario = { sub: 4, role: 'OPERARIO' };
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.inventarioPT.updateMany.mockResolvedValue({ count: 1 });
    prisma.reservaInventarioPT.deleteMany.mockResolvedValue({ count: 1 });
    prisma.reservaInventarioPT.count.mockResolvedValue(0);
  });

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

  it('400 si la OP tiene producción pendiente (lo reservado no cubre amarrado + a producir)', async () => {
    const op = opBase();
    // 5 amarrados de bodega + 2 por fabricar; solo hay 5 reservados → faltan 2 pares.
    (op.lineas[0].tallas[0] as any).cantAmarrada = 5;
    op.lineas[0].tallas[0].cantAProducir = 2;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(/faltan 2 pares/);
  });

  it('una OP fabricada se despacha: lo producido quedó reservado al entrar a PT, aunque cantAProducir siga siendo lo programado', async () => {
    const op = opBase();
    (op.lineas[0].tallas[0] as any).cantAmarrada = 0;
    op.lineas[0].tallas[0].cantAProducir = 5; // lo programado no cambia al producir
    prisma.ordenProduccion.findUnique.mockResolvedValue(op); // reservas: 5 (los 5 pares terminados)
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 6n }]);
    prisma.despacho.create.mockResolvedValue({ id: 2, consecutivo: 6 });
    await expect(service.despachar({ opId: 1 }, operario)).resolves.toBeDefined();
    expect(prisma.despacho.create).toHaveBeenCalled();
  });

  it('un pedido que cedió pares a otro queda debiendo: el despacho falla por faltante', async () => {
    const op = opBase();
    // Pedido de 20 fabricado completo; gerencia pasó 5 a otro pedido: se reprogramaron
    // (25 a producir, 5 cedidos) y quedan 15 reservados → faltan 5.
    (op.lineas[0].tallas[0] as any).cantAmarrada = 0;
    op.lineas[0].tallas[0].cantAProducir = 25;
    (op.lineas[0].tallas[0] as any).reassignedOut = 5;
    op.lineas[0].tallas[0].reservas[0].cantidad = 15;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(/faltan 5 pares/);
  });

  it('cuando el pedido que cedió vuelve a completar sus 20, despacha (lo cedido no se le suma)', async () => {
    const op = opBase();
    (op.lineas[0].tallas[0] as any).cantAmarrada = 0;
    op.lineas[0].tallas[0].cantAProducir = 25;
    (op.lineas[0].tallas[0] as any).reassignedOut = 5;
    op.lineas[0].tallas[0].reservas[0].cantidad = 20;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 7n }]);
    prisma.despacho.create.mockResolvedValue({ id: 3, consecutivo: 7 });
    await expect(service.despachar({ opId: 1 }, operario)).resolves.toBeDefined();
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
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
    prisma.despacho.create.mockResolvedValue({ id: 1, consecutivo: 5 });
    await service.despachar({ opId: 1 }, operario);
    expect(prisma.inventarioPT.updateMany).toHaveBeenCalledWith({
      where: { id: 50, cantDisponible: { gte: 5 }, cantReservada: { gte: 5 } },
      data: { cantDisponible: { decrement: 5 }, cantReservada: { decrement: 5 } },
    });
    // Borra la reserva solo si sigue como se leyó (una reasignación en paralelo la pudo cambiar).
    expect(prisma.reservaInventarioPT.deleteMany).toHaveBeenCalledWith({ where: { id: 100, cantidad: 5 } });
    const createArg = prisma.despacho.create.mock.calls[0][0];
    expect(createArg.data.consecutivo).toBe(5);
    expect(createArg.data.opId).toBe(1);
    expect(createArg.data.autorizadoPorId).toBeNull();
    // El grado viaja al remito: sin él, una segunda saldría rotulada como primera.
    expect(createArg.data.lineas.create).toEqual([
      { productoConfiguradoId: 7, tallaId: 10, bodegaId: 2, calidad: 'PRIMERA', cantidad: 5 },
    ]);
    expect(prisma.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'DESPACHADA' } });
    expect(prisma.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { estado: 'CERRADA' } });
  });

  it('VENCIDO + gerente autoriza: registra autorizadoPor y motivo', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.despacho.create.mockResolvedValue({ id: 2, consecutivo: 1 });
    await service.despachar({ opId: 1, autorizar: true, motivo: 'urgente' }, gerente);
    const createArg = prisma.despacho.create.mock.calls[0][0];
    expect(createArg.data.autorizadoPorId).toBe(3);
    expect(createArg.data.motivoAutorizacion).toBe('urgente');
  });

  it('registra movimientos SALIDA/DESPACHO en el kardex por cada reserva despachada', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
    prisma.despacho.create.mockResolvedValue({ id: 1, consecutivo: 5 });
    await service.despachar({ opId: 1 }, operario);

    expect(prisma.movimientoInventario.createMany).toHaveBeenCalledWith({
      data: [
        {
          tipo: 'SALIDA',
          motivo: 'DESPACHO',
          inventarioPTId: 50,
          cantidad: 5,
          referencia: 'DSP-5',
          usuarioId: 4,
          lineaId: 3, // la línea de la OP se sella en el kardex (reporte por línea)
        },
      ],
    });
  });

  it('al despachar libera el amarre de insumos de la OP (la producción terminó)', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
    prisma.despacho.create.mockResolvedValue({ id: 1, consecutivo: 5 });
    prisma.requerimientoCompra.findMany.mockResolvedValue([
      { id: 7, lineas: [{ materialId: 3, cantReservada: 40 }] },
    ]);
    await service.despachar({ opId: 1 }, operario);
    expect(prisma.requerimientoCompra.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { opId: 1, reservaActiva: true } }),
    );
    expect(prisma.inventarioMaterial.update).toHaveBeenCalledWith({
      where: { materialId: 3 },
      data: { cantReservada: { decrement: 40 } },
    });
    expect(prisma.requerimientoCompra.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { reservaActiva: false },
    });
  });

  it('falla con 409 si el inventario ya no alcanza al momento de despachar', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
    prisma.inventarioPT.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toBeInstanceOf(ConflictException);
  });

  describe('carrera con una reasignación de pares', () => {
    it('409 si una reserva cambió entre la lectura y el despacho (no descuenta de más)', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
      prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
      prisma.reservaInventarioPT.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(/cambió mientras se despachaba/);
      expect(prisma.despacho.create).not.toHaveBeenCalled();
    });

    it('409 si le llegaron reservas nuevas a la OP mientras se despachaba', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opBase());
      prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
      prisma.reservaInventarioPT.count.mockResolvedValue(1);
      await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(/cambió mientras se despachaba/);
      expect(prisma.despacho.create).not.toHaveBeenCalled();
    });

    it('descuenta el inventario en orden de inventarioPTId (orden canónico de locks)', async () => {
      const op = opBase();
      op.lineas[0].tallas[0].reservas = [
        { id: 101, inventarioPTId: 60, cantidad: 2, inventarioPT: { bodegaId: 3 } },
        { id: 100, inventarioPTId: 50, cantidad: 3, inventarioPT: { bodegaId: 2 } },
      ];
      prisma.ordenProduccion.findUnique.mockResolvedValue(op);
      prisma.$queryRawUnsafe.mockResolvedValue([{ v: 5n }]);
      prisma.despacho.create.mockResolvedValue({ id: 1, consecutivo: 5 });
      await service.despachar({ opId: 1 }, operario);
      const ids = prisma.inventarioPT.updateMany.mock.calls.map((c: any) => c[0].where.id);
      expect(ids).toEqual([50, 60]);
    });
  });
});
