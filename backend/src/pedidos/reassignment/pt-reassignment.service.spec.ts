import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { DespachoService } from '../../despachos/despacho.service';
import { pendingToProduce } from '../op/op-need';
import { PtReassignmentController } from './pt-reassignment.controller';
import { PtReassignmentService } from './pt-reassignment.service';

/**
 * El caso de JP (2026-11-19): las Alpaca de Guantes Terry (OP-1, A) están listas y
 * reservadas, pero no se despachan; Vozincol (OP-2, B) las necesita ya.
 */
const gerente = { sub: 3, role: 'GERENTE' };
const admin = { sub: 1, role: 'ADMIN' };

function filaA(over: any = {}) {
  // A: pedido de 20 talla 40, fabricado completo y reservado (15 en la bodega
  // principal, 5 en la secundaria).
  return {
    id: 10, tallaId: 3, cantPedida: 20, cantAmarrada: 0, cantAProducir: 20, reassignedOut: 0,
    reservas: [
      { id: 100, inventarioPTId: 500, cantidad: 15, inventarioPT: { id: 500, bodegaId: 1, bodega: { prioridad: 10 } } },
      { id: 101, inventarioPTId: 600, cantidad: 5, inventarioPT: { id: 600, bodegaId: 2, bodega: { prioridad: 20 } } },
    ],
    ...over,
  };
}

function filaB(over: any = {}) {
  // B: pedido de 30 talla 40, sin nada en bodega al generarse: 30 a producir, nada nacido.
  return { id: 20, tallaId: 3, cantPedida: 30, cantAmarrada: 0, cantAProducir: 30, reassignedOut: 0, reservas: [], ...over };
}

function makePrisma(ops: Record<number, any>, filas: Record<number, any[]>) {
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    ordenProduccionLineaTalla: {
      findMany: jest.fn((args: any) => Promise.resolve(filas[args.where.opLinea.opId] ?? [])),
      update: jest.fn(),
    },
    reservaInventarioPT: { delete: jest.fn(), update: jest.fn(), create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    inventarioPT: { update: jest.fn() },
    par: { count: jest.fn().mockResolvedValue(0) },
    etiquetaReservada: { count: jest.fn().mockResolvedValue(0) },
    ptReassignment: { create: jest.fn((a: any) => Promise.resolve({ id: 1, ...a.data })) },
  };
  const prisma: any = {
    ordenProduccion: { findUnique: jest.fn((a: any) => Promise.resolve(ops[a.where.id] ?? null)) },
    ptReassignment: { findMany: jest.fn().mockResolvedValue([]) },
    ordenProduccionLineaTalla: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((cb: any) => cb(tx)),
  };
  return { prisma, tx };
}

const OPS = {
  1: { id: 1, consecutivo: 101, estado: 'AMARRADA' },
  2: { id: 2, consecutivo: 102, estado: 'AMARRADA' },
};
const base = { productoConfiguradoId: 7, tallaId: 3, calidad: 'PRIMERA' as const, quantity: 5, reason: 'Vozincol paga de contado' };

describe('PtReassignmentService.reassign: pasar pares de A a B', () => {
  it('caso feliz: A suelta 5, B los toma sobre la misma fila de inventario y queda el registro', async () => {
    const { prisma, tx } = makePrisma(OPS, { 1: [filaA()], 2: [filaB()] });
    const r = await new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, gerente);

    // Lock del saldo antes de tocar reservas.
    expect(tx.$queryRaw).toHaveBeenCalled();
    // Sale de la bodega principal primero (prioridad 10).
    expect(tx.reservaInventarioPT.update).toHaveBeenCalledWith({ where: { id: 100 }, data: { cantidad: { decrement: 5 } } });
    expect(tx.reservaInventarioPT.create).toHaveBeenCalledWith({ data: { opLineaTallaId: 20, inventarioPTId: 500, cantidad: 5 } });
    // Pasar no cambia el total reservado de la fila: no se toca InventarioPT.
    expect(tx.inventarioPT.update).not.toHaveBeenCalled();
    // A queda debiendo: reprograma 5 sin que su necesidad cambie.
    expect(tx.ordenProduccionLineaTalla.update).toHaveBeenCalledWith({
      where: { id: 10 }, data: { cantAProducir: { increment: 5 }, reassignedOut: { increment: 5 } },
    });
    // B deja de programar lo que recibió hecho.
    expect(tx.ordenProduccionLineaTalla.update).toHaveBeenCalledWith({
      where: { id: 20 }, data: { cantAmarrada: { increment: 5 }, cantAProducir: { decrement: 5 } },
    });
    expect(tx.ptReassignment.create).toHaveBeenCalledWith({
      data: { fromOpId: 1, toOpId: 2, productoConfiguradoId: 7, tallaId: 3, calidad: 'PRIMERA', quantity: 5, reason: 'Vozincol paga de contado', userId: 3 },
    });
    expect(r).toMatchObject({ fromOpId: 1, toOpId: 2, quantity: 5 });
  });

  it('si B ya tenía reserva sobre esa fila, la engorda; si se vacía la de A, se borra', async () => {
    const { prisma, tx } = makePrisma(OPS, { 1: [filaA()], 2: [filaB()] });
    tx.reservaInventarioPT.findFirst.mockResolvedValue({ id: 900 });
    await new PtReassignmentService(prisma).reassign(1, { ...base, quantity: 15, toOpId: 2 }, admin);
    expect(tx.reservaInventarioPT.delete).toHaveBeenCalledWith({ where: { id: 100 } });
    expect(tx.reservaInventarioPT.update).toHaveBeenCalledWith({ where: { id: 900 }, data: { cantidad: { increment: 15 } } });
  });

  it('B no des-programa lo que ya nació en planta', async () => {
    const { prisma, tx } = makePrisma(OPS, { 1: [filaA()], 2: [filaB()] });
    tx.par.count.mockResolvedValue(27); // 27 de 30 ya nacieron: solo 3 se pueden des-programar
    await new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, gerente);
    expect(tx.ordenProduccionLineaTalla.update).toHaveBeenCalledWith({
      where: { id: 20 }, data: { cantAmarrada: { increment: 3 }, cantAProducir: { decrement: 3 } },
    });
  });

  it('segundas: A queda debiendo pero no se reprograma nada (las segundas no se fabrican)', async () => {
    const { prisma, tx } = makePrisma(OPS, {
      1: [filaA({ cantAmarrada: 20, cantAProducir: 0 })],
      2: [filaB({ cantAmarrada: 10, cantAProducir: 0, reservas: [{ id: 300, inventarioPTId: 500, cantidad: 4 }] })],
    });
    await new PtReassignmentService(prisma).reassign(1, { ...base, calidad: 'SEGUNDA', toOpId: 2 }, gerente);
    expect(tx.ordenProduccionLineaTalla.update).not.toHaveBeenCalled();
    expect(tx.reservaInventarioPT.create).toHaveBeenCalled();
  });

  describe('lo que se rechaza', () => {
    it('403 si no es gerente ni admin (y no abre transacción)', async () => {
      for (const role of ['OPERARIO', 'CLIENTE', 'CALIDAD', 'JEFE_CORTE', 'STAGE']) {
        const { prisma } = makePrisma(OPS, { 1: [filaA()], 2: [filaB()] });
        await expect(new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, { sub: 9, role })).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
      }
    });

    it('400 sin motivo (o solo espacios)', async () => {
      const { prisma } = makePrisma(OPS, { 1: [filaA()], 2: [filaB()] });
      await expect(new PtReassignmentService(prisma).reassign(1, { ...base, reason: '   ', toOpId: 2 }, gerente)).rejects.toThrow(/motivo/);
    });

    it('400 si el destino es el mismo pedido', async () => {
      const { prisma } = makePrisma(OPS, { 1: [filaA()] });
      await expect(new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 1 }, gerente)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 si alguna OP no existe; 400 si está despachada o anulada', async () => {
      const { prisma } = makePrisma({ ...OPS, 3: { id: 3, consecutivo: 103, estado: 'DESPACHADA' }, 4: { id: 4, consecutivo: 104, estado: 'ANULADA' } }, {});
      const s = new PtReassignmentService(prisma);
      await expect(s.reassign(1, { ...base, toOpId: 99 }, gerente)).rejects.toBeInstanceOf(NotFoundException);
      await expect(s.reassign(3, { ...base, toOpId: 2 }, gerente)).rejects.toThrow(/despachada/);
      await expect(s.reassign(1, { ...base, toOpId: 4 }, gerente)).rejects.toThrow(/anulada/);
    });

    it('400 si B no tiene una línea del mismo producto, talla y calidad', async () => {
      const { prisma, tx } = makePrisma(OPS, { 1: [filaA()], 2: [] });
      await expect(new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, gerente)).rejects.toThrow(/no pidió ese producto/);
      expect(tx.ptReassignment.create).not.toHaveBeenCalled();
    });

    it('400 si A no tiene reserva de eso', async () => {
      const { prisma } = makePrisma(OPS, { 1: [filaA({ reservas: [] })], 2: [filaB()] });
      await expect(new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, gerente)).rejects.toThrow(/no tiene pares reservados/);
    });

    it('400 si a A se le saca más de lo reservado', async () => {
      const { prisma } = makePrisma(OPS, { 1: [filaA()], 2: [filaB()] });
      await expect(new PtReassignmentService(prisma).reassign(1, { ...base, quantity: 21, toOpId: 2 }, gerente)).rejects.toThrow(/solo tiene 20/);
    });

    it('400 si a B se le pasa más de lo que le falta', async () => {
      // B pidió 30 y ya tiene 27 reservados: le faltan 3.
      const { prisma, tx } = makePrisma(OPS, { 1: [filaA()], 2: [filaB({ reservas: [{ id: 300, inventarioPTId: 500, cantidad: 27 }] })] });
      await expect(new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, gerente)).rejects.toThrow(/solo le faltan 3/);
      expect(tx.reservaInventarioPT.update).not.toHaveBeenCalled();
    });
  });
});

describe('PtReassignmentService.release: liberar de A', () => {
  it('la reserva de A baja y el saldo reservado de la fila también: los pares quedan libres', async () => {
    const { prisma, tx } = makePrisma(OPS, { 1: [filaA()] });
    await new PtReassignmentService(prisma).release(1, { ...base, quantity: 17 }, gerente);
    expect(tx.reservaInventarioPT.delete).toHaveBeenCalledWith({ where: { id: 100 } });
    expect(tx.reservaInventarioPT.update).toHaveBeenCalledWith({ where: { id: 101 }, data: { cantidad: { decrement: 2 } } });
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({ where: { id: 500 }, data: { cantReservada: { decrement: 15 } } });
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({ where: { id: 600 }, data: { cantReservada: { decrement: 2 } } });
    expect(tx.reservaInventarioPT.create).not.toHaveBeenCalled();
    expect(tx.ptReassignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromOpId: 1, toOpId: null, quantity: 17 }) });
  });

  it('403 para un rol que no es gerencia', async () => {
    const { prisma } = makePrisma(OPS, { 1: [filaA()] });
    await expect(new PtReassignmentService(prisma).release(1, base, { sub: 9, role: 'OPERARIO' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('A queda honesto después de ceder', () => {
  /** Aplica a la fila de A lo que el service mandó escribir. */
  async function estadoDeA() {
    const fila = filaA();
    const { prisma, tx } = makePrisma(OPS, { 1: [fila], 2: [filaB()] });
    await new PtReassignmentService(prisma).reassign(1, { ...base, toOpId: 2 }, gerente);
    const upd = tx.ordenProduccionLineaTalla.update.mock.calls.find((c: any) => c[0].where.id === 10)[0].data;
    return {
      ...fila,
      cantAProducir: fila.cantAProducir + upd.cantAProducir.increment,
      reassignedOut: fila.reassignedOut + upd.reassignedOut.increment,
      reservas: [
        { ...fila.reservas[0], cantidad: 10 },
        fila.reservas[1],
      ],
    };
  }

  it('el despacho de A falla por los 5 que cedió', async () => {
    const a = await estadoDeA();
    const prisma: any = {
      ordenProduccion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1, ocId: 9, estado: 'AMARRADA', despacho: null, oc: { cliente: { estadoCartera: 'AL_DIA' } },
          lineas: [{ productoConfiguradoId: 7, tallas: [a] }],
        }),
      },
    };
    await expect(new DespachoService(prisma).despachar({ opId: 1 }, gerente)).rejects.toThrow(/faltan 5 pares/);
  });

  it('la proyección vuelve a poner esos 5 por producir', async () => {
    const a = await estadoDeA();
    expect(pendingToProduce('PRIMERA', a)).toBe(5);
  });
});

describe('PtReassignmentService.options', () => {
  it('lista lo reservado de la OP y los pedidos vivos que pueden recibirlo, con lo que les falta', async () => {
    const { prisma } = makePrisma({}, {});
    prisma.ordenProduccion.findUnique.mockResolvedValue({
      id: 1, estado: 'AMARRADA',
      lineas: [{
        productoConfiguradoId: 7, calidad: 'PRIMERA', productoConfigurado: { nombreComercial: 'Alpaca' },
        tallas: [
          { tallaId: 3, talla: { valor: 40 }, reservas: [{ cantidad: 15 }, { cantidad: 5 }] },
          { tallaId: 4, talla: { valor: 41 }, reservas: [] },
        ],
      }],
    });
    prisma.ordenProduccionLineaTalla.findMany.mockResolvedValue([
      { tallaId: 3, cantAmarrada: 0, cantAProducir: 30, reassignedOut: 0, reservas: [{ cantidad: 2 }],
        opLinea: { productoConfiguradoId: 7, calidad: 'PRIMERA', op: { id: 2, consecutivo: 102, oc: { consecutivo: 55, ocCliente: 'VZ-9', cliente: { nombre: 'Vozincol' } } } } },
      // Completo: no aparece.
      { tallaId: 3, cantAmarrada: 5, cantAProducir: 0, reassignedOut: 0, reservas: [{ cantidad: 5 }],
        opLinea: { productoConfiguradoId: 7, calidad: 'PRIMERA', op: { id: 3, consecutivo: 103, oc: { consecutivo: 56, cliente: { nombre: 'Otro' } } } } },
      // Otra calidad: no aparece.
      { tallaId: 3, cantAmarrada: 5, cantAProducir: 0, reassignedOut: 0, reservas: [],
        opLinea: { productoConfiguradoId: 7, calidad: 'SEGUNDA', op: { id: 4, consecutivo: 104, oc: { consecutivo: 57, cliente: { nombre: 'Saldos' } } } } },
    ]);

    const r = await new PtReassignmentService(prisma).options(1);
    expect(r).toEqual([
      {
        productoConfiguradoId: 7, producto: 'Alpaca', tallaId: 3, talla: 40, calidad: 'PRIMERA', reservado: 20,
        targets: [{ opId: 2, opConsecutivo: 102, ocConsecutivo: 55, ocCliente: 'VZ-9', cliente: 'Vozincol', pendiente: 28 }],
      },
    ]);
    // Solo pedidos vivos y distintos de A.
    expect(prisma.ordenProduccionLineaTalla.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          opLinea: expect.objectContaining({ opId: { not: 1 }, op: { estado: { in: ['CREADA', 'AMARRADA', 'EN_PRODUCCION'] } } }),
        }),
      }),
    );
  });

  it('404 si la OP no existe', async () => {
    const { prisma } = makePrisma({}, {});
    await expect(new PtReassignmentService(prisma).options(9)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PtReassignmentController: el backend exige gerencia', () => {
  const reflector = new Reflector();
  it('pasar, liberar y ver opciones llevan @Roles(ADMIN, GERENTE); el historial no', () => {
    const proto = PtReassignmentController.prototype;
    for (const m of [proto.reassign, proto.release, proto.options])
      expect(reflector.get(ROLES_KEY, m)).toEqual(['ADMIN', 'GERENTE']);
    expect(reflector.get(ROLES_KEY, proto.history)).toBeUndefined();
  });
});
