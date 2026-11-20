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
    $queryRaw: jest.fn(),
    ordenProduccion: { findUnique: jest.fn(), update: jest.fn() },
    ordenProduccionLineaTalla: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    despacho: { create: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _max: { deliveryNumber: null } }) },
    inventarioPT: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    reservaInventarioPT: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn(),
    },
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
    prisma.reservaInventarioPT.updateMany.mockResolvedValue({ count: 1 });
    prisma.reservaInventarioPT.findMany.mockResolvedValue([]);
    prisma.despacho.aggregate.mockResolvedValue({ _max: { deliveryNumber: null } });
    // Lo que se relee adentro de la transacción para decidir si la OP se cierra:
    // sin tallas = todo despachado (los tests del despacho total).
    prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([]);
  });

  it('404 si la OP no existe', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(null);
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(NotFoundException);
  });

  it('400 si la OP ya fue despachada', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ estado: 'DESPACHADA' }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('409 si la OP no está amarrada', async () => {
    prisma.ordenProduccion.findUnique.mockResolvedValue(opBase({ estado: 'CREADA' }));
    await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(BadRequestException);
  });

  it('despacha una OP EN_PRODUCCION cuando todos sus pares ya entraron a PT (19-nov)', async () => {
    const op = opBase({ estado: 'EN_PRODUCCION' });
    // Nada de bodega, 5 fabricados y los 5 ya reservados al entrar a PT.
    (op.lineas[0].tallas[0] as any).cantAmarrada = 0;
    op.lineas[0].tallas[0].cantAProducir = 5;
    prisma.ordenProduccion.findUnique.mockResolvedValue(op);
    prisma.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
    prisma.despacho.create.mockResolvedValue({ id: 1 });
    await service.despachar({ opId: 1 }, operario);
    expect(prisma.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'DESPACHADA' } });
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
  describe('despacho parcial (JP, 2026-11-19)', () => {
    // Pedido de 20 (todo a producir), 12 ya en bodega reservados, nada despachado.
    function opParcial(over: any = {}) {
      const op = opBase({ estado: 'EN_PRODUCCION', ...over });
      Object.assign(op.lineas[0].tallas[0], { cantAmarrada: 0, cantAProducir: 20, dispatched: 0 });
      op.lineas[0].tallas[0].reservas[0].cantidad = 12;
      return op;
    }
    beforeEach(() => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ v: 8n }]);
      prisma.despacho.create.mockResolvedValue({ id: 9, consecutivo: 8 });
    });

    it('sin lines, una OP incompleta sigue sin poder despacharse completa', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial());
      await expect(service.despachar({ opId: 1 }, operario)).rejects.toThrow(/faltan 8 pares/);
    });

    it('despacha una parte: baja la reserva, sube lo despachado y la OP queda abierta', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial());
      prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([
        { id: 30, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, dispatched: 5 },
      ]);
      const res = await service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 5 }] }, operario);
      // Lock de la OP adentro de la transacción (mismo orden que la reasignación).
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(prisma.inventarioPT.updateMany).toHaveBeenCalledWith({
        where: { id: 50, cantDisponible: { gte: 5 }, cantReservada: { gte: 5 } },
        data: { cantDisponible: { decrement: 5 }, cantReservada: { decrement: 5 } },
      });
      // La reserva baja solo si sigue como se leyó.
      expect(prisma.reservaInventarioPT.updateMany).toHaveBeenCalledWith({
        where: { id: 100, cantidad: 12 },
        data: { cantidad: { decrement: 5 } },
      });
      expect(prisma.reservaInventarioPT.deleteMany).not.toHaveBeenCalled();
      expect(prisma.ordenProduccionLineaTalla.update).toHaveBeenCalledWith({
        where: { id: 30 },
        data: { dispatched: { increment: 5 } },
      });
      expect(prisma.despacho.create.mock.calls[0][0].data.lineas.create).toEqual([
        { productoConfiguradoId: 7, tallaId: 10, bodegaId: 2, calidad: 'PRIMERA', cantidad: 5 },
      ]);
      expect(prisma.movimientoInventario.createMany.mock.calls[0][0].data[0]).toEqual(
        expect.objectContaining({ cantidad: 5, referencia: 'DSP-8' }),
      );
      // Abierta: ni DESPACHADA ni OC cerrada ni se suelta el amarre de insumos.
      expect(prisma.ordenProduccion.update).not.toHaveBeenCalled();
      expect(prisma.ordenCompra.update).not.toHaveBeenCalled();
      expect(prisma.requerimientoCompra.findMany).not.toHaveBeenCalled();
      expect(res).toEqual(expect.objectContaining({ id: 9, opClosed: false }));
    });

    it('el despacho que completa lo pedido cierra la OP como el total', async () => {
      const op = opParcial();
      (op.lineas[0].tallas[0] as any).dispatched = 8; // ya salieron 8 antes
      prisma.ordenProduccion.findUnique.mockResolvedValue(op);
      prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([
        { id: 30, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, dispatched: 20 },
      ]);
      const res = await service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 12 }] }, operario);
      expect(prisma.reservaInventarioPT.deleteMany).toHaveBeenCalledWith({ where: { id: 100, cantidad: 12 } });
      expect(prisma.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'DESPACHADA' } });
      expect(prisma.ordenCompra.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { estado: 'CERRADA' } });
      expect(res).toEqual(expect.objectContaining({ opClosed: true }));
    });

    it('sin lines, una OP con parciales previos y el resto en bodega se despacha completa', async () => {
      const op = opParcial();
      (op.lineas[0].tallas[0] as any).dispatched = 8;
      prisma.ordenProduccion.findUnique.mockResolvedValue(op);
      await service.despachar({ opId: 1 }, operario);
      expect(prisma.ordenProduccion.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { estado: 'DESPACHADA' } });
    });

    it('400 si pide más de lo reservado de la talla', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial());
      await expect(
        service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 13 }] }, operario),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('la cartera vencida bloquea también el despacho parcial', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial({ oc: { cliente: { estadoCartera: 'VENCIDO' } } }));
      await expect(
        service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 5 }] }, operario),
      ).rejects.toThrow(ConflictException);
    });

    it('409 si la reserva cambió entre la lectura y el despacho parcial', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial());
      prisma.reservaInventarioPT.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 5 }] }, operario),
      ).rejects.toThrow(/cambió mientras se despachaba/);
      expect(prisma.despacho.create).not.toHaveBeenCalled();
    });

    it('409 si otra transacción cerró o anuló la OP antes del lock', async () => {
      prisma.ordenProduccion.findUnique
        .mockResolvedValueOnce(opParcial())
        .mockResolvedValueOnce({ estado: 'ANULADA' });
      await expect(
        service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 5 }] }, operario),
      ).rejects.toThrow(/cambió mientras se despachaba/);
    });

    it('numera la entrega dentro de la OP: la primera es Entrega 1 y no es final si queda abierta', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial());
      prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([
        { id: 30, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, dispatched: 5 },
      ]);
      await service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 5 }] }, operario);
      expect(prisma.despacho.aggregate).toHaveBeenCalledWith({ where: { opId: 1 }, _max: { deliveryNumber: true } });
      // El número se saca con la OP ya bloqueada.
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.despacho.aggregate.mock.invocationCallOrder[0]);
      expect(prisma.despacho.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ deliveryNumber: 1, isFinal: false }),
      );
    });

    it('la entrega que cierra la OP sigue la numeración y queda marcada como final', async () => {
      const op = opParcial();
      (op.lineas[0].tallas[0] as any).dispatched = 8;
      prisma.ordenProduccion.findUnique.mockResolvedValue(op);
      prisma.despacho.aggregate.mockResolvedValue({ _max: { deliveryNumber: 2 } });
      prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([
        { id: 30, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, dispatched: 20 },
      ]);
      await service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 12 }] }, operario);
      expect(prisma.despacho.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ deliveryNumber: 3, isFinal: true }),
      );
    });

    it('al cerrar suelta en bodega lo que haya quedado reservado de más', async () => {
      prisma.ordenProduccion.findUnique.mockResolvedValue(opParcial());
      prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([
        { id: 30, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0, dispatched: 20 },
      ]);
      prisma.reservaInventarioPT.findMany.mockResolvedValue([{ id: 100, inventarioPTId: 50, cantidad: 2 }]);
      await service.despachar({ opId: 1, lines: [{ opLineaTallaId: 30, quantity: 10 }] }, operario);
      expect(prisma.reservaInventarioPT.delete).toHaveBeenCalledWith({ where: { id: 100 } });
      expect(prisma.inventarioPT.update).toHaveBeenCalledWith({
        where: { id: 50 },
        data: { cantReservada: { decrement: 2 } },
      });
    });
  });
});
