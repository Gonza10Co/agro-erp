import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';
import { ESTACIONES_PILOTO } from './fabricacion-core';

const BODEGA_ID = 7;

function makePrisma(overrides: any = {}) {
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ v: 5n }]),
    ordenFabricacion: {
      create: jest.fn().mockResolvedValue({ id: 1, consecutivo: 5 }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    par: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    eventoTrazabilidad: { create: jest.fn().mockResolvedValue({}) },
    inventarioPT: { upsert: jest.fn().mockResolvedValue({ id: 33 }) },
    movimientoInventario: { create: jest.fn().mockResolvedValue({}) },
    ...overrides.tx,
  };
  const prisma: any = {
    ordenProduccion: {
      findUnique: jest.fn(),
    },
    par: { findUnique: jest.fn() },
    // La bodega destino se resuelve fuera de la transacción (config global).
    bodega: { findFirst: jest.fn().mockResolvedValue({ id: BODEGA_ID }) },
    // Las estaciones del piloto tal como nacen en la migración (Cierre apagada).
    estacion: {
      findMany: jest.fn().mockResolvedValue(ESTACIONES_PILOTO.map((e) => ({ ...e }))),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    eventoTrazabilidad: { count: jest.fn().mockResolvedValue(0) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx };
}

describe('FabricacionService.generarOF', () => {
  it('crea la OF con el consecutivo de la secuencia y SIN pares (nacen en Preparación)', async () => {
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
    // Desde el 2026-09-09 la OF no pare pares: cada uno nace cuando se le imprime
    // la etiqueta en Preparación. Lo programado (3) viaja para el tablero.
    expect(tx.par.createMany).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 1, consecutivo: 5, opId: 100, totalPares: 0, programados: 3 });
  });

  it('consecutivo = 1 cuando no hay OFs previas', async () => {
    const { prisma, tx } = makePrisma();
    tx.$queryRawUnsafe.mockResolvedValue([{ v: 1n }]);
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

// ─────────────── Nacimiento del par en la estación inicial (piloto) ───────────────
function ofParaNacer(extra: any = {}) {
  return {
    id: 1,
    consecutivo: 5,
    estado: 'ABIERTA',
    op: {
      lineaId: 3,
      linea: { id: 3, celulaInicial: 'CORTE', subPasoInicial: null },
      lineas: [
        {
          productoConfiguradoId: 10,
          productoConfigurado: { marca: { lineaId: null, linea: null } },
          tallas: [
            { tallaId: 1, cantAProducir: 20, talla: { valor: 40 } },
            { tallaId: 2, cantAProducir: 0, talla: { valor: 41 } },
          ],
        },
      ],
    },
    ...extra,
  };
}

function makeNacer(of: any = ofParaNacer(), nacidos = 0, seqBase = 0) {
  const { prisma, tx } = makePrisma();
  prisma.ordenFabricacion = { findUnique: jest.fn().mockResolvedValue(of) };
  tx.$queryRaw = jest.fn().mockResolvedValue([]);
  tx.par.count = jest.fn().mockResolvedValueOnce(nacidos).mockResolvedValueOnce(seqBase);
  tx.par.findMany = jest.fn().mockImplementation(async ({ where }: any) =>
    where.codigo.in.map((codigo: string, i: number) => ({
      id: 100 + i,
      codigo,
      talla: { valor: 40 },
      productoConfigurado: { codigo: 'BOT-40', nombreComercial: 'Bota Fortia', referencia: { codigo: '107' }, marca: { nombre: 'Fortia' } },
      linea: { codigo: 'BASARILI', nombre: 'Basarili' },
    })),
  );
  tx.eventoTrazabilidad.createMany = jest.fn().mockResolvedValue({ count: 1 });
  return { prisma, tx, service: new FabricacionService(prisma) };
}

describe('FabricacionService.nacer', () => {
  const dto = { productoConfiguradoId: 10, tallaId: 1, cantidad: 2, operarioId: 3 };

  it('crea los pares en Preparación con numeración continua y un evento de entrada por par', async () => {
    const { tx, service } = makeNacer(ofParaNacer(), 5, 7);
    const res = await service.nacer(1, dto);

    expect(tx.$queryRaw).toHaveBeenCalled(); // lock de la OF: dos celulares no se pisan
    expect(tx.par.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ codigo: 'OF5-0008', celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', subPasoInyeccion: null, lineaId: 3, tallaId: 1 }),
        expect.objectContaining({ codigo: 'OF5-0009' }),
      ],
    });
    expect(tx.eventoTrazabilidad.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ parId: 100, celula: 'GUARNICION', subPaso: 'PREPARACION', estacionDestino: 'PREPARACION', celulaDestino: 'GUARNICION', operarioId: 3, maquinaId: null }),
        expect.objectContaining({ parId: 101 }),
      ],
    });
    expect(res.estacion.codigo).toBe('PREPARACION');
    expect(res.pares).toEqual([
      expect.objectContaining({ codigo: 'OF5-0008', talla: '40', producto: 'Bota Fortia', referencia: '107', marca: 'Fortia', linea: 'Basarili', of: 5 }),
      expect.objectContaining({ codigo: 'OF5-0009' }),
    ]);
  });

  it('el primer nacimiento pone la OF EN_PROCESO', async () => {
    const { tx, service } = makeNacer();
    await service.nacer(1, dto);
    expect(tx.ordenFabricacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'EN_PROCESO' } }),
    );
  });

  it('no deja nacer más pares que los programados para la talla', async () => {
    const { tx, service } = makeNacer(ofParaNacer(), 19, 19);
    await expect(service.nacer(1, dto)).rejects.toMatchObject({
      message: expect.stringContaining('ya tiene 19 de 20'),
    });
    expect(tx.par.createMany).not.toHaveBeenCalled();
  });

  it('una línea Feroz (arranca en INYECCION) nace en Montaje', async () => {
    const of = ofParaNacer({ op: { ...ofParaNacer().op, lineaId: 4, linea: { id: 4, celulaInicial: 'INYECCION', subPasoInicial: null } } });
    const { tx, service } = makeNacer(of);
    const res = await service.nacer(1, dto);
    expect(res.estacion.codigo).toBe('MONTAJE');
    expect(tx.par.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ celulaActual: 'INYECCION', subPasoActual: null, subPasoInyeccion: 'MONTAJE', lineaId: 4 }),
      ]),
    });
  });

  it('400 si la OF no fabrica ese producto o no programa esa talla', async () => {
    const { service } = makeNacer();
    await expect(service.nacer(1, { ...dto, productoConfiguradoId: 99 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.nacer(1, { ...dto, tallaId: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 si la OF está anulada o terminada; 404 si no existe', async () => {
    const anulada = makeNacer(ofParaNacer({ estado: 'ANULADA' }));
    await expect(anulada.service.nacer(1, dto)).rejects.toBeInstanceOf(ConflictException);
    const { service, prisma } = makeNacer();
    prisma.ordenFabricacion.findUnique.mockResolvedValue(null);
    await expect(service.nacer(1, dto)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FabricacionService.activarEstacion', () => {
  it('apaga y prende una estación; PT no se puede apagar', async () => {
    const { prisma } = makePrisma();
    prisma.estacion.findUnique.mockResolvedValue({ codigo: 'CIERRE', celula: 'GUARNICION' });
    await new FabricacionService(prisma).activarEstacion('CIERRE', true);
    expect(prisma.estacion.update).toHaveBeenCalledWith({ where: { codigo: 'CIERRE' }, data: { activa: true } });

    prisma.estacion.findUnique.mockResolvedValue({ codigo: 'PT', celula: 'PT' });
    await expect(new FabricacionService(prisma).activarEstacion('PT', false)).rejects.toBeInstanceOf(BadRequestException);
    prisma.estacion.findUnique.mockResolvedValue(null);
    await expect(new FabricacionService(prisma).activarEstacion('XXX', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('FabricacionService.obtenerOF', () => {
  it('trae por par el producto y la línea (datos de la etiqueta física)', async () => {
    const { prisma } = makePrisma({
      root: { ordenFabricacion: { findUnique: jest.fn().mockResolvedValue({ id: 1, pares: [] }) } },
    });
    await new FabricacionService(prisma).obtenerOF(1);
    const select = prisma.ordenFabricacion.findUnique.mock.calls[0][0].include.pares.select;
    expect(select.productoConfigurado).toEqual({ select: { codigo: true, nombreComercial: true } });
    expect(select.linea).toEqual({ select: { codigo: true, nombre: true } });
  });

  it('404 si la OF no existe', async () => {
    const { prisma } = makePrisma({
      root: { ordenFabricacion: { findUnique: jest.fn().mockResolvedValue(null) } },
    });
    await expect(new FabricacionService(prisma).obtenerOF(99)).rejects.toBeInstanceOf(NotFoundException);
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
    prisma.eventoTrazabilidad.count.mockResolvedValue(41);
    const service = new FabricacionService(prisma);

    const res = await service.avanzar('OF1-0001', dto);

    // El evento dice de dónde sale Y a dónde entra (el pistolazo es de entrada).
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parId: 50, celula: 'CORTE', operarioId: 3, maquinaId: 4,
          estacionDestino: 'PREPARACION', celulaDestino: 'GUARNICION',
        }),
      }),
    );
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION' }) }),
    );
    // Lo que ve el operario: a dónde entró y cuántos van hoy ahí.
    expect(res.avance).toEqual({ estacion: 'PREPARACION', nombre: 'Preparación', terminado: false, hoy: 41 });
  });

  it('la máquina es opcional (en Bodega o PT no hay máquina)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', { operarioId: 3 });
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ maquinaId: null, estacionDestino: 'BODEGA_CORTE' }) }),
    );
  });

  it('con la estación declarada, rechaza el pistolazo si el par no viene de la anterior', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await expect(
      new FabricacionService(prisma).avanzar('OF1-0001', { ...dto, estacion: 'MONTAJE' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('le toca Bodega de corte') });
    expect(tx.eventoTrazabilidad.create).not.toHaveBeenCalled();
  });

  it('con la estación declarada correcta, avanza normal', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', { ...dto, estacion: 'BODEGA_CORTE' });
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'ALMACEN', subPasoActual: null }) }),
    );
  });

  it('si Cierre se prende, el par pasa por ahí antes de Bodega', async () => {
    const { prisma, tx } = makePrisma();
    prisma.estacion.findMany.mockResolvedValue(
      ESTACIONES_PILOTO.map((e) => (e.codigo === 'CIERRE' ? { ...e, activa: true } : { ...e })),
    );
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION', subPasoActual: 'CIERRE' }) }),
    );
  });

  it('desde Finizaje, entrar a PT termina el par en un solo pistolazo (5º)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'INYECCION', subPasoActual: null, subPasoInyeccion: 'FINIZAJE',
      estado: 'EN_PROCESO', calidad: 'PRIMERA', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    const res = await new FabricacionService(prisma).avanzar('OF1-0001', { ...dto, estacion: 'PT' });
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'TERMINADO', celulaActual: 'PT', subPasoActual: null, subPasoInyeccion: null } }),
    );
    expect(tx.inventarioPT.upsert).toHaveBeenCalled();
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celula: 'INYECCION', subPasoInyeccion: 'FINIZAJE', estacionDestino: 'PT', celulaDestino: 'PT' }) }),
    );
    expect(res.avance).toMatchObject({ estacion: 'PT', terminado: true });
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

  it('el primer escaneo activa la OF aunque el par arranque en INYECCION (línea Feroz)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'INYECCION', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' },
    });
    tx.par.update.mockResolvedValue({ id: 50, celulaActual: 'PT' });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.ordenFabricacion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: 'EN_PROCESO' } }),
    );
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'PT' }) }),
    );
  });

  it('desde PT termina el par y suma 1 a InventarioPT', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'EN_PROCESO', calidad: 'PRIMERA',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    tx.par.count.mockResolvedValue(0); // era el último par en proceso
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);

    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'TERMINADO', celulaActual: 'PT' }) }),
    );
    // La llave del stock incluye el grado: un par de primera no puede caer en el
    // saldo de segundas ni al revés.
    expect(tx.inventarioPT.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productoConfiguradoId_tallaId_bodegaId_calidad: {
            productoConfiguradoId: 10,
            tallaId: 1,
            bodegaId: BODEGA_ID,
            calidad: 'PRIMERA',
          },
        },
        create: expect.objectContaining({ cantDisponible: 1, calidad: 'PRIMERA' }),
        update: { cantDisponible: { increment: 1 } },
      }),
    );
    // El cierre usa updateMany condicionado para no pisar una OF ANULADA
    // por una anulación de OP concurrente.
    expect(tx.ordenFabricacion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1, estado: { not: 'ANULADA' } },
        data: { estado: 'TERMINADA' },
      }),
    );
  });

  it('un par marcado de SEGUNDA entra al saldo de segundas, no al de primeras', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, ofId: 1, celulaActual: 'PT', estado: 'EN_PROCESO', calidad: 'SEGUNDA',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);

    expect(tx.inventarioPT.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productoConfiguradoId_tallaId_bodegaId_calidad: {
            productoConfiguradoId: 10,
            tallaId: 1,
            bodegaId: BODEGA_ID,
            calidad: 'SEGUNDA',
          },
        },
        create: expect.objectContaining({ calidad: 'SEGUNDA', cantDisponible: 1 }),
        update: { cantDisponible: { increment: 1 } },
      }),
    );
  });

  it('al terminar en PT registra movimiento ENTRADA/PRODUCCION en el kardex con la línea del par', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, codigo: 'OF1-0001', ofId: 1, celulaActual: 'PT', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, lineaId: 12, of: { estado: 'EN_PROCESO' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);

    expect(tx.movimientoInventario.create).toHaveBeenCalledWith({
      data: {
        tipo: 'ENTRADA',
        motivo: 'PRODUCCION',
        inventarioPTId: 33, // el id que devuelve el upsert de InventarioPT
        cantidad: 1,
        referencia: 'OF1-0001',
        lineaId: 12, // la línea viaja del par al kardex (reporte por línea)
      },
    });
  });

  it('el avance entre células intermedias NO genera movimiento de kardex', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 50, codigo: 'OF1-0001', ofId: 1, celulaActual: 'CORTE', estado: 'EN_PROCESO',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' },
    });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.movimientoInventario.create).not.toHaveBeenCalled();
  });

  it('avance desde célula intermedia no toca el estado de la OF', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 51, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'AMARRE', estado: 'EN_PROCESO',
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

  it('409 si el par está cancelado', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 1, codigo: 'OF5-0001', estado: 'CANCELADO', celulaActual: 'CORTE', of: { estado: 'EN_PROCESO' },
    });
    await expect(
      new FabricacionService(prisma).avanzar('OF5-0001', { operarioId: 1, maquinaId: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('409 con mensaje específico si el par fue dado de baja', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 1, codigo: 'OF5-0001', estado: 'DADO_DE_BAJA', celulaActual: 'CORTE',
      of: { estado: 'EN_PROCESO' },
    });
    await expect(new FabricacionService(prisma).avanzar('OF5-0001', dto))
      .rejects.toMatchObject({ message: 'El par fue dado de baja' });
  });

  it('un par viejo en CORTE entra a Guarnición por PREPARACION y registra evento con subPaso null', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ id: 50, ofId: 1, celulaActual: 'CORTE', subPasoActual: null, estado: 'EN_PROCESO', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'ABIERTA' } });
    tx.par.update.mockResolvedValue({ id: 50 });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celula: 'CORTE', subPaso: null }) }));
    expect(tx.par.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION' }) }));
  });

  it('un par viejo en un sub-paso intermedio de Guarnición cae en la siguiente estación activa (Bodega)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'ARMADO', estado: 'EN_PROCESO', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' } });
    tx.par.update.mockResolvedValue({ id: 50 });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celula: 'GUARNICION', subPaso: 'ARMADO', celulaDestino: 'ALMACEN' }) }));
    expect(tx.par.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'ALMACEN', subPasoActual: null }) }));
  });

  it('desde AMARRE sale a Almacén con subPasoActual null', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ id: 50, ofId: 1, celulaActual: 'GUARNICION', subPasoActual: 'AMARRE', estado: 'EN_PROCESO', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' } });
    tx.par.update.mockResolvedValue({ id: 50 });
    await new FabricacionService(prisma).avanzar('OF1-0001', dto);
    expect(tx.par.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'ALMACEN', subPasoActual: null }) }));
  });
});

describe('FabricacionService lecturas', () => {
  it('tablero filtra por ofId cuando se pasa', async () => {
    const { prisma } = makePrisma();
    prisma.par = {
      ...prisma.par,
      findMany: jest.fn().mockResolvedValue([]),
    };
    await new FabricacionService(prisma).tablero(1);
    expect(prisma.par.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ofId: 1 } }),
    );
  });

  it('tablero sin ofId no filtra', async () => {
    const { prisma } = makePrisma();
    prisma.par = { ...prisma.par, findMany: jest.fn().mockResolvedValue([]) };
    await new FabricacionService(prisma).tablero(undefined);
    expect(prisma.par.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('tablero limita la consulta a 500 pares', async () => {
    const { prisma } = makePrisma({ root: { par: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } } });
    await new FabricacionService(prisma).tablero();
    expect(prisma.par.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500 }),
    );
  });
});

describe('FabricacionService.avanzar (hardening)', () => {
  it('400 si el operario o la máquina no existen (P2003)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({
      id: 1, codigo: 'OF5-0001', estado: 'EN_PROCESO', celulaActual: 'CORTE',
      ofId: 1, productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
    });
    tx.eventoTrazabilidad.create.mockRejectedValue(
      Object.assign(new Error('FK'), { code: 'P2003' }),
    );
    await expect(
      new FabricacionService(prisma).avanzar('OF5-0001', { operarioId: 999, maquinaId: 999 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
