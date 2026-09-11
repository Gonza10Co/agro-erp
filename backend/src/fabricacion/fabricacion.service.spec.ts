import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';
import { ESTACIONES_PILOTO } from './fabricacion-core';
import { CalidadService } from '../calidad/calidad.service';

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
      id: 50, ofId: 1, celulaActual: 'CORTE', estado: 'EN_PROCESO', calidad: 'PRIMERA',
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
    expect(res.avance).toEqual({
      estacion: 'PREPARACION', nombre: 'Preparación', terminado: false, hoy: 41,
      calidad: 'PRIMERA', incidencia: null, parReposicion: null,
    });
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

  /** Las 6 estaciones acordadas en planta, con Cierre apagada (como nacen en la tabla). */
  function estacionesDePrueba() {
    return [
      { codigo: 'PREPARACION', nombre: 'Preparación', orden: 1, celula: 'GUARNICION', subPaso: 'PREPARACION', subPasoInyeccion: null, activa: true },
      { codigo: 'CIERRE', nombre: 'Cierre', orden: 2, celula: 'GUARNICION', subPaso: 'CIERRE', subPasoInyeccion: null, activa: false },
      { codigo: 'BODEGA_CORTE', nombre: 'Bodega de corte', orden: 3, celula: 'ALMACEN', subPaso: null, subPasoInyeccion: null, activa: true },
      { codigo: 'MONTAJE', nombre: 'Inyección · Montaje', orden: 4, celula: 'INYECCION', subPaso: null, subPasoInyeccion: 'MONTAJE', activa: true },
      { codigo: 'PT', nombre: 'Producto terminado', orden: 6, celula: 'PT', subPaso: null, subPasoInyeccion: null, activa: true },
    ];
  }

  function prismaDeTablero(grupos: unknown[]) {
    return makePrisma({
      root: {
        par: { findUnique: jest.fn(), findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue(grupos) },
        talla: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, valor: 36, orden: 1 },
            { id: 2, valor: 38, orden: 2 },
          ]),
        },
        estacion: { findMany: jest.fn().mockResolvedValue(estacionesDePrueba()) },
        ordenFabricacion: {
          findMany: jest.fn().mockResolvedValue([
            { op: { lineas: [{ tallas: [{ tallaId: 1, cantAProducir: 200 }, { tallaId: 2, cantAProducir: 400 }] }] } },
          ]),
        },
      },
    });
  }

  it('tableroResumen cuenta por ESTACIÓN y desglosa por talla, sin traer pares', async () => {
    const { prisma } = prismaDeTablero([
      { celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', subPasoInyeccion: null, estado: 'EN_PROCESO', tallaId: 2, _count: { _all: 200 } },
      { celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', subPasoInyeccion: null, estado: 'EN_PROCESO', tallaId: 1, _count: { _all: 140 } },
      { celulaActual: 'PT', subPasoActual: null, subPasoInyeccion: null, estado: 'TERMINADO', tallaId: 1, _count: { _all: 146 } },
      { celulaActual: 'INYECCION', subPasoActual: null, subPasoInyeccion: 'MONTAJE', estado: 'DADO_DE_BAJA', tallaId: 1, _count: { _all: 3 } },
    ]);

    const r = await new FabricacionService(prisma).tableroResumen();

    // Un día de planta son ~1.206 pares: la lista no se pide nunca.
    expect(prisma.par.findMany).not.toHaveBeenCalled();
    const preparacion = r.estaciones.find((c) => c.codigo === 'PREPARACION')!;
    expect(preparacion.total).toBe(340);
    // Las tallas salen en el orden del catálogo, no en el que respondió la base.
    expect(preparacion.tallas).toEqual([
      { talla: 36, cantidad: 140 },
      { talla: 38, cantidad: 200 },
    ]);
    expect(r.terminados).toBe(146);
    expect(r.fueraDeFlujo).toBe(3);
    expect(r.total).toBe(489);
    // Solo las estaciones ACTIVAS son columnas: Cierre está apagada y no aparece.
    expect(r.estaciones.map((c) => c.codigo)).toEqual([
      'CORTE_PENDIENTE', 'PREPARACION', 'BODEGA_CORTE', 'MONTAJE', 'PT',
    ]);
  });

  it('la columna Corte es lo programado que todavía no nació, por talla', async () => {
    const { prisma } = prismaDeTablero([
      { celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', subPasoInyeccion: null, estado: 'EN_PROCESO', tallaId: 1, _count: { _all: 50 } },
    ]);

    const r = await new FabricacionService(prisma).tableroResumen();

    // Programado 200 + 400; nació 50 de la talla 36 ⇒ faltan 150 y 400.
    const corte = r.estaciones.find((c) => c.codigo === 'CORTE_PENDIENTE')!;
    expect(corte.nombre).toBe('Corte');
    expect(corte.total).toBe(550);
    expect(corte.tallas).toEqual([
      { talla: 36, cantidad: 150 },
      { talla: 38, cantidad: 400 },
    ]);
    expect(r.programado).toBe(600);
  });

  it('un par que no cae en ninguna estación activa va a la columna Otros', async () => {
    const { prisma } = prismaDeTablero([
      // Nacido antes del piloto: sigue en CORTE, que ya no es una estación.
      { celulaActual: 'CORTE', subPasoActual: null, subPasoInyeccion: null, estado: 'EN_PROCESO', tallaId: 1, _count: { _all: 7 } },
    ]);

    const r = await new FabricacionService(prisma).tableroResumen();

    const otros = r.estaciones.find((c) => c.codigo === 'OTROS')!;
    expect(otros.total).toBe(7);
  });

  it('tablero trae una página de 100 pares y nunca más de 500', async () => {
    const { prisma } = makePrisma({ root: { par: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) } } });
    const service = new FabricacionService(prisma);

    await service.tablero();
    expect(prisma.par.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 0 }));

    // El detalle es de una columna: pedir "todo" no puede volver a traer la planta entera.
    await service.tablero(undefined, { take: 5000 });
    expect(prisma.par.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 500 }));
  });

  it('tablero filtra por la posición de una estación y por varios estados a la vez', async () => {
    const { prisma } = makePrisma({
      root: {
        par: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
        estacion: { findMany: jest.fn().mockResolvedValue(estacionesDePrueba()) },
      },
    });
    await new FabricacionService(prisma).tablero(7, {
      estacion: 'PREPARACION',
      estados: ['DADO_DE_BAJA', 'CANCELADO'],
    });
    expect(prisma.par.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ofId: 7,
          celulaActual: 'GUARNICION',
          subPasoActual: 'PREPARACION',
          subPasoInyeccion: null,
          estado: { in: ['DADO_DE_BAJA', 'CANCELADO'] },
        },
      }),
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

/**
 * "Algo pasó con este par": el pistolazo trae `tipoDanoId` y la clase del tipo
 * decide el destino. Se usa el CalidadService real sobre el mismo prisma falso:
 * lo que se prueba es la integración (sellar segunda dentro de la tx del
 * pistolazo), no un mock de calidad.
 */
describe('FabricacionService.avanzar — con daño tipificado', () => {
  const gerente = { sub: 3, role: 'GERENTE' };
  const operario = { sub: 8, role: 'OPERARIO' };
  const tipoSegunda = { id: 11, codigo: 'REBABA-SUELA', nombre: 'Rebaba en la suela', celulaCausante: 'INYECCION', clase: 'SEGUNDA', activo: true };
  const tipoReproceso = { id: 7, codigo: 'ECONOMIZADOR-RASGADO', nombre: 'Economizador rasgado', celulaCausante: 'INYECCION', clase: 'REPROCESO', activo: true };
  const tipoBaja = { id: 8, codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada', celulaCausante: 'INYECCION', clase: 'BAJA', activo: true };

  function armar(par: any, tipo: any) {
    const { prisma, tx } = makePrisma({
      tx: {
        par: {
          createMany: jest.fn(), count: jest.fn().mockResolvedValue(1),
          update: jest.fn().mockResolvedValue({ id: 50, codigo: 'OF1-0001', ...par }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          create: jest.fn().mockResolvedValue({ id: 99, codigo: 'OF1-0001-R1', celulaActual: 'GUARNICION' }),
        },
        incidenciaCalidad: { create: jest.fn().mockResolvedValue({ id: 5, tipoDano: tipo }) },
      },
    });
    prisma.par.findUnique.mockResolvedValue({
      id: 50, codigo: 'OF1-0001', ofId: 1, estado: 'EN_PROCESO', calidad: 'PRIMERA',
      productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' }, ...par,
    });
    prisma.tipoDano = { findUnique: jest.fn().mockResolvedValue(tipo) };
    prisma.eventoTrazabilidad.count.mockResolvedValue(12);
    const service = new FabricacionService(prisma, undefined as any, new CalidadService(prisma));
    return { prisma, tx, service };
  }

  it('SEGUNDA en una estación intermedia: sella el grado, deja la incidencia en la estación de ENTRADA y el par sigue', async () => {
    const { tx, service } = armar({ celulaActual: 'ALMACEN' }, tipoSegunda);
    const res = await service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 11, estacion: 'MONTAJE' }, operario);

    // Todo dentro de la misma transacción del pistolazo.
    expect(tx.par.updateMany).toHaveBeenCalledWith({ where: { id: 50, estado: 'EN_PROCESO' }, data: { calidad: 'SEGUNDA' } });
    expect(tx.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parId: 50, tipoDanoId: 11, celulaDeteccion: 'INYECCION', operarioId: 3, autorizadoPorId: 8 }),
      }),
    );
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaActual: 'INYECCION', subPasoInyeccion: 'MONTAJE' }) }),
    );
    expect(res.avance).toMatchObject({
      estacion: 'MONTAJE', terminado: false, calidad: 'SEGUNDA', parReposicion: null,
      incidencia: { tipoDano: { codigo: 'REBABA-SUELA', nombre: 'Rebaba en la suela', clase: 'SEGUNDA' } },
    });
    // No exige nota: el tipo ya dice por qué.
  });

  it('SEGUNDA al entrar a PT: el par termina en el saldo de SEGUNDAS aunque venía como primera', async () => {
    const { tx, service } = armar({ celulaActual: 'INYECCION', subPasoInyeccion: 'FINIZAJE' }, tipoSegunda);
    const res = await service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 11, estacion: 'PT' }, operario);

    expect(tx.par.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { calidad: 'SEGUNDA' } }));
    expect(tx.par.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'TERMINADO', celulaActual: 'PT' }) }),
    );
    expect(tx.inventarioPT.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productoConfiguradoId_tallaId_bodegaId_calidad: expect.objectContaining({ calidad: 'SEGUNDA' }) },
        create: expect.objectContaining({ calidad: 'SEGUNDA' }),
      }),
    );
    // La operaria de PT es quien la rechaza: la detección queda en PT.
    expect(tx.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ celulaDeteccion: 'PT' }) }),
    );
    expect(res.avance).toMatchObject({ terminado: true, calidad: 'SEGUNDA' });
  });

  it('REPROCESO: queda la incidencia, el par entra normal y sigue de primera', async () => {
    const { tx, service } = armar({ celulaActual: 'ALMACEN' }, tipoReproceso);
    const res = await service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 7, descripcion: 'se despegó' }, operario);

    expect(tx.par.updateMany).not.toHaveBeenCalled();
    expect(tx.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipoDanoId: 7, celulaDeteccion: 'INYECCION', descripcion: 'se despegó', autorizadoPorId: null }),
      }),
    );
    expect(tx.par.update).toHaveBeenCalled();
    expect(res.avance).toMatchObject({ estacion: 'MONTAJE', calidad: 'PRIMERA', incidencia: { tipoDano: { clase: 'REPROCESO' } } });
  });

  it('BAJA: el par NO entra a la estación; muere donde está y su reposición nace en Preparación', async () => {
    const { prisma, tx, service } = armar({ celulaActual: 'ALMACEN' }, tipoBaja);
    // reportar() relee el par con sus relaciones de línea.
    prisma.par.findUnique.mockResolvedValue({
      id: 50, codigo: 'OF1-0001', ofId: 1, estado: 'EN_PROCESO', calidad: 'PRIMERA',
      productoConfiguradoId: 10, tallaId: 1, celulaActual: 'ALMACEN', of: { estado: 'EN_PROCESO' },
      linea: { celulaInicial: 'CORTE' }, lineaId: 2,
    });
    const res = await service.avanzar(
      'OF1-0001',
      { operarioId: 3, tipoDanoId: 8, descripcion: 'El robot rasgó la capellada', estacion: 'MONTAJE' },
      gerente,
    );

    // Ni evento de entrada ni avance: el par no llegó a Montaje.
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledTimes(1); // solo el nacimiento de la reposición
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ parId: 99, estacionDestino: 'PREPARACION' }),
    });
    expect(tx.par.update).not.toHaveBeenCalled();
    expect(tx.par.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: 'DADO_DE_BAJA' } }));
    expect(tx.par.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codigo: 'OF1-0001-R1', celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION', reponeAParId: 50 }) }),
    );
    expect(res).toMatchObject({
      codigo: 'OF1-0001', estado: 'DADO_DE_BAJA',
      avance: {
        estacion: 'MONTAJE', nombre: 'Dado de baja', terminado: false, hoy: 12,
        incidencia: { tipoDano: { clase: 'BAJA' } },
        parReposicion: { codigo: 'OF1-0001-R1', celulaActual: 'GUARNICION' },
      },
    });
  });

  it('BAJA sin rol de gerente → 403 antes de tocar nada; sin nota → 400', async () => {
    const a = armar({ celulaActual: 'ALMACEN' }, tipoBaja);
    await expect(
      a.service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 8, descripcion: 'acta' }, operario),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.prisma.$transaction).not.toHaveBeenCalled();

    const b = armar({ celulaActual: 'ALMACEN' }, tipoBaja);
    await expect(
      b.service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 8 }, gerente),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(b.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('un tipo de daño inexistente o inactivo → 404, y el par no se mueve', async () => {
    const { prisma, service } = armar({ celulaActual: 'ALMACEN' }, { ...tipoSegunda, activo: false });
    await expect(
      service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 11 }, operario),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('con la estación declarada, un par fuera de orden se rechaza aunque traiga daño (primero el control)', async () => {
    const { prisma, service } = armar({ celulaActual: 'GUARNICION', subPasoActual: 'PREPARACION' }, tipoSegunda);
    await expect(
      service.avanzar('OF1-0001', { operarioId: 3, tipoDanoId: 11, estacion: 'MONTAJE' }, operario),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
