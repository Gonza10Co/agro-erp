import { ConflictException, BadRequestException } from '@nestjs/common';
import { OcService } from './oc.service';
import { unconfirmBlockers, UnconfirmSnapshot } from './oc-unconfirm';

const vacia = (): UnconfirmSnapshot => ({
  despachos: [],
  ofs: [],
  ptReassignmentsOut: 0,
  ptReassignmentsIn: 0,
  tallas: [{ dispatched: 0, reassignedOut: 0 }],
  requerimientos: [{ consecutivo: 7, ordenesCompra: [] }],
});

describe('unconfirmBlockers', () => {
  it('nada arrancó: no hay motivos', () => {
    expect(unconfirmBlockers(vacia())).toEqual([]);
  });

  it('una OF abierta y vacía no bloquea', () => {
    const s = vacia();
    s.ofs = [{ consecutivo: 23, estado: 'ABIERTA', pares: 0, etiquetasReservadas: 0, movimientos: 0, ordenesCorte: [] }];
    expect(unconfirmBlockers(s)).toEqual([]);
  });

  it('pares nacidos', () => {
    const s = vacia();
    s.ofs = [{ consecutivo: 23, estado: 'EN_PROCESO', pares: 40, etiquetasReservadas: 0, movimientos: 0, ordenesCorte: [] }];
    expect(unconfirmBlockers(s)).toEqual(['Ya hay 40 pares nacidos en la OF-23']);
  });

  it('un solo par nacido va en singular', () => {
    const s = vacia();
    s.ofs = [{ consecutivo: 5, estado: 'EN_PROCESO', pares: 1, etiquetasReservadas: 0, movimientos: 0, ordenesCorte: [] }];
    expect(unconfirmBlockers(s)).toEqual(['Ya hay 1 par nacido en la OF-5']);
  });

  it('etiquetas impresas, consumo y corte', () => {
    const s = vacia();
    s.ofs = [{ consecutivo: 9, estado: 'ABIERTA', pares: 0, etiquetasReservadas: 20, movimientos: 3, ordenesCorte: ['AGR-861'] }];
    expect(unconfirmBlockers(s)).toEqual([
      'Ya hay 20 etiquetas impresas por adelantado en la OF-9',
      'Ya se registró consumo de materiales en la OF-9',
      'La OF-9 ya está programada en la orden de corte AGR-861',
    ]);
  });

  it('despacho y factura', () => {
    const s = vacia();
    s.despachos = [{ consecutivo: 12, factura: { consecutivo: 4 } }];
    expect(unconfirmBlockers(s)).toEqual(['Ya está facturado (FAC-4)', 'Ya tiene un despacho (DSP-12)']);
  });

  it('pares pasados desde o hacia el pedido', () => {
    const s = vacia();
    s.ptReassignmentsOut = 1;
    s.ptReassignmentsIn = 2;
    expect(unconfirmBlockers(s)).toEqual([
      'Ya se pasaron o liberaron pares de este pedido hacia otro',
      'Este pedido ya recibió pares pasados desde otro pedido',
    ]);
  });

  it('requerimiento convertido en OCP', () => {
    const s = vacia();
    s.requerimientos = [{ consecutivo: 7, ordenesCompra: [{ consecutivo: 31 }] }];
    expect(unconfirmBlockers(s)).toEqual([
      'El requerimiento REQ-7 ya se convirtió en orden de compra a proveedor (OCP-31)',
    ]);
  });
});

describe('OcService.unconfirm', () => {
  function armar(opOverrides: any = {}, ocEstado = 'EN_PRODUCCION') {
    const op = {
      id: 50,
      consecutivo: 18,
      lineas: [{ tallas: [{ id: 80, dispatched: 0, reassignedOut: 0, reservas: [{ id: 300, inventarioPTId: 70, cantidad: 5 }] }] }],
      despachos: [],
      ordenesFabricacion: [],
      requerimientos: [{ id: 9, consecutivo: 7, ordenesCompra: [] }],
      _count: { ptReassignmentsOut: 0, ptReassignmentsIn: 0 },
      ...opOverrides,
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      ordenCompra: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, consecutivo: 40, estado: ocEstado }),
        update: jest.fn().mockResolvedValue({ id: 1, consecutivo: 40, estado: 'BORRADOR' }),
      },
      ordenProduccion: {
        findUnique: jest.fn().mockImplementation((args: any) =>
          Promise.resolve(args.select ? (op ? { id: op.id } : null) : op),
        ),
        delete: jest.fn(),
      },
      reservaInventarioPT: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
      inventarioPT: { update: jest.fn() },
      requerimientoCompra: {
        // Reserva de insumos activa: 2,5 m del material 4 apartados.
        findMany: jest.fn().mockResolvedValue([{ id: 9, lineas: [{ materialId: 4, cantReservada: 2.5 }] }]),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      requerimientoCompraLinea: { deleteMany: jest.fn() },
      inventarioMaterial: { update: jest.fn() },
      ordenFabricacion: { deleteMany: jest.fn() },
      ordenProduccionLineaTalla: { deleteMany: jest.fn() },
      ordenProduccionLinea: { deleteMany: jest.fn() },
    };
    const prisma: any = { $transaction: jest.fn((cb: any) => cb(tx)) };
    return { tx, service: new OcService(prisma) };
  }

  it('suelta PT e insumos, borra requerimiento, OF y OP, y deja la OC en BORRADOR con rastro', async () => {
    const { tx, service } = armar({
      ordenesFabricacion: [{ id: 3, consecutivo: 23, estado: 'ABIERTA', lineasCorte: [], _count: { pares: 0, etiquetasReservadas: 0, movimientos: 0 } }],
    });
    await service.unconfirm(1, 4);

    // Amarre de PT: la reserva se borra solo si sigue como se leyó y vuelve al disponible.
    expect(tx.reservaInventarioPT.deleteMany).toHaveBeenCalledWith({ where: { id: 300, cantidad: 5 } });
    expect(tx.inventarioPT.update).toHaveBeenCalledWith({ where: { id: 70 }, data: { cantReservada: { decrement: 5 } } });
    // Amarre de insumos: vuelve al neto disponible.
    expect(tx.inventarioMaterial.update).toHaveBeenCalledWith({ where: { materialId: 4 }, data: { cantReservada: { decrement: 2.5 } } });
    // Requerimiento automático, OF vacía y OP borrados.
    expect(tx.requerimientoCompraLinea.deleteMany).toHaveBeenCalledWith({ where: { requerimientoId: { in: [9] } } });
    expect(tx.requerimientoCompra.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [9] } } });
    expect(tx.ordenFabricacion.deleteMany).toHaveBeenCalledWith({ where: { opId: 50 } });
    expect(tx.ordenProduccion.delete).toHaveBeenCalledWith({ where: { id: 50 } });
    // La liberación va antes del borrado (si no, la FK del requerimiento lo impide).
    expect(tx.inventarioMaterial.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.requerimientoCompra.deleteMany.mock.invocationCallOrder[0],
    );
    const data = tx.ordenCompra.update.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({
      estado: 'BORRADOR', fechaConfirmacion: null, unconfirmedById: 4, unconfirmedOpNumber: 18,
    }));
    expect(data.unconfirmedAt).toBeInstanceOf(Date);
  });

  it('una OC confirmada sin OP solo vuelve a BORRADOR', async () => {
    const { tx, service } = armar(null as any, 'CONFIRMADA');
    tx.ordenProduccion.findUnique.mockResolvedValue(null);
    await service.unconfirm(1, 4);
    expect(tx.ordenProduccion.delete).not.toHaveBeenCalled();
    expect(tx.ordenCompra.update.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ estado: 'BORRADOR', fechaConfirmacion: null, unconfirmedOpNumber: null }),
    );
  });

  it('rechaza un pedido en borrador, cerrado o anulado', async () => {
    for (const estado of ['BORRADOR', 'CERRADA', 'ANULADA']) {
      const { service } = armar({}, estado);
      await expect(service.unconfirm(1, 4)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  const bloqueados: [string, any, RegExp][] = [
    ['pares nacidos', { ordenesFabricacion: [{ id: 3, consecutivo: 23, estado: 'EN_PROCESO', lineasCorte: [], _count: { pares: 40, etiquetasReservadas: 0, movimientos: 0 } }] }, /40 pares nacidos en la OF-23/],
    ['despacho', { despachos: [{ consecutivo: 12, factura: null }] }, /Ya tiene un despacho \(DSP-12\)/],
    ['factura', { despachos: [{ consecutivo: 12, factura: { consecutivo: 4 } }] }, /Ya está facturado \(FAC-4\)/],
    ['reasignación', { _count: { ptReassignmentsOut: 0, ptReassignmentsIn: 1 } }, /recibió pares pasados desde otro pedido/],
    ['consumo de MP', { ordenesFabricacion: [{ id: 3, consecutivo: 23, estado: 'ABIERTA', lineasCorte: [], _count: { pares: 0, etiquetasReservadas: 0, movimientos: 2 } }] }, /consumo de materiales en la OF-23/],
    ['OCP generada', { requerimientos: [{ id: 9, consecutivo: 7, ordenesCompra: [{ consecutivo: 31 }] }] }, /REQ-7 ya se convirtió .* \(OCP-31\)/],
  ];
  it.each(bloqueados)('bloquea con 409 si hay %s y no toca nada', async (_n, over, msg) => {
    const { tx, service } = armar(over);
    const p = service.unconfirm(1, 4);
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow(msg);
    expect(tx.reservaInventarioPT.deleteMany).not.toHaveBeenCalled();
    expect(tx.inventarioMaterial.update).not.toHaveBeenCalled();
    expect(tx.ordenProduccion.delete).not.toHaveBeenCalled();
    expect(tx.ordenCompra.update).not.toHaveBeenCalled();
  });

  it('409 si una reserva cambió en paralelo (y no borra la OP)', async () => {
    const { tx, service } = armar();
    tx.reservaInventarioPT.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.unconfirm(1, 4)).rejects.toThrow(/cambió mientras se devolvía/);
    expect(tx.ordenProduccion.delete).not.toHaveBeenCalled();
  });
});
