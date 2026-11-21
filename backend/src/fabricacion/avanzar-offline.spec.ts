import { BadRequestException } from '@nestjs/common';
import { FabricacionService } from './fabricacion.service';
import { ESTACIONES_PILOTO, horaDelEscaneo } from './fabricacion-core';

/**
 * Modo sin internet (2026-11-21): la tablet guarda el pistolazo y lo manda
 * después, con su hora real (`scannedAt`) y un id propio (`clientScanId`) para
 * que un reintento no duplique el evento.
 */
function makePrisma() {
  const tx: any = {
    ordenFabricacion: { update: jest.fn().mockResolvedValue({}) },
    par: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 50, codigo: 'OF1-0001', celulaActual: 'GUARNICION' }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([{ id: 100, codigo: 'OF5-0003' }]),
    },
    eventoTrazabilidad: { create: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    etiquetaReservada: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma: any = {
    par: { findUnique: jest.fn() },
    estacion: { findMany: jest.fn().mockResolvedValue(ESTACIONES_PILOTO.map((e) => ({ ...e }))) },
    eventoTrazabilidad: { count: jest.fn().mockResolvedValue(7), findUnique: jest.fn().mockResolvedValue(null) },
    etiquetaReservada: { findUnique: jest.fn().mockResolvedValue(null) },
    bodega: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, tx, service: new FabricacionService(prisma) };
}

const PAR_EN_CORTE = {
  id: 50, ofId: 1, codigo: 'OF1-0001', celulaActual: 'CORTE', subPasoActual: null, estado: 'EN_PROCESO',
  calidad: 'PRIMERA', productoConfiguradoId: 10, tallaId: 1, of: { estado: 'EN_PROCESO' },
};

describe('horaDelEscaneo', () => {
  const ahora = new Date('2026-11-21T15:00:00.000Z');

  it('sin hora no sella nada (la base pone la suya)', () => {
    expect(horaDelEscaneo(undefined, ahora)).toBeUndefined();
    expect(horaDelEscaneo('', ahora)).toBeUndefined();
  });

  it('respeta la hora real de un pistolazo atrasado', () => {
    expect(horaDelEscaneo('2026-11-21T09:30:00.000Z', ahora)).toEqual(new Date('2026-11-21T09:30:00.000Z'));
    // ISO con zona de Bogotá: es el mismo instante en UTC.
    expect(horaDelEscaneo('2026-11-21T04:30:00-05:00', ahora)).toEqual(new Date('2026-11-21T09:30:00.000Z'));
  });

  it('un adelanto de reloj pequeño se recorta a ahora; más de 5 minutos se rechaza', () => {
    expect(horaDelEscaneo('2026-11-21T15:04:00.000Z', ahora)).toEqual(ahora);
    expect(() => horaDelEscaneo('2026-11-21T15:06:00.000Z', ahora)).toThrow(/futuro/);
  });

  it('más de 7 días de atraso se rechaza', () => {
    expect(horaDelEscaneo('2026-11-14T15:01:00.000Z', ahora)).toEqual(new Date('2026-11-14T15:01:00.000Z'));
    expect(() => horaDelEscaneo('2026-11-14T14:59:00.000Z', ahora)).toThrow(/7 días/);
  });

  it('una fecha inválida se rechaza', () => {
    expect(() => horaDelEscaneo('no-es-fecha', ahora)).toThrow(/no es válida/);
  });
});

describe('FabricacionService.avanzar: modo sin internet', () => {
  it('sin los campos nuevos el evento no cambia (la hora la pone la base)', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(PAR_EN_CORTE);
    await service.avanzar('OF1-0001', { operarioId: 3, estacion: 'PREPARACION' });
    const data = tx.eventoTrazabilidad.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('timestamp');
    expect(data).not.toHaveProperty('clientScanId');
    expect(prisma.eventoTrazabilidad.findUnique).not.toHaveBeenCalled();
  });

  it('con scannedAt y clientScanId el evento queda con la hora REAL y el id', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(PAR_EN_CORTE);
    const scannedAt = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const res: any = await service.avanzar('OF1-0001', { operarioId: 3, estacion: 'PREPARACION', scannedAt, clientScanId: 'abc-1' });
    expect(tx.eventoTrazabilidad.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ parId: 50, estacionDestino: 'PREPARACION', timestamp: new Date(scannedAt), clientScanId: 'abc-1' }),
    });
    expect(res.avance).toEqual(expect.objectContaining({ estacion: 'PREPARACION', hoy: 7 }));
    expect(res.avance.repetido).toBeUndefined();
  });

  it('las estaciones saltadas quedan con la hora del pistolazo, pero el id solo en el evento real', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(PAR_EN_CORTE);
    const scannedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await service.avanzar('OF1-0001', { operarioId: 3, estacion: 'BODEGA_CORTE', scannedAt, clientScanId: 'abc-2' });
    const eventos = tx.eventoTrazabilidad.create.mock.calls.map((c: any) => c[0].data);
    expect(eventos.length).toBeGreaterThan(1);
    for (const e of eventos) expect(e.timestamp).toEqual(new Date(scannedAt));
    expect(eventos.filter((e: any) => e.clientScanId === 'abc-2')).toHaveLength(1);
    expect(eventos.find((e: any) => e.clientScanId === 'abc-2').inferido).toBeUndefined();
  });

  it('el mismo clientScanId otra vez responde lo ya registrado sin duplicar', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.eventoTrazabilidad.findUnique.mockResolvedValue({
      id: 900, parId: 50, estacionDestino: 'PREPARACION',
      par: { id: 50, codigo: 'OF1-0001', celulaActual: 'GUARNICION', estado: 'EN_PROCESO', calidad: 'PRIMERA' },
    });
    prisma.eventoTrazabilidad.count.mockImplementation(async ({ where }: any) => (where.parId ? 1 : 12));
    const res: any = await service.avanzar('OF1-0001', { operarioId: 3, estacion: 'PREPARACION', clientScanId: 'abc-1' });
    expect(prisma.par.findUnique).not.toHaveBeenCalled();
    expect(tx.eventoTrazabilidad.create).not.toHaveBeenCalled();
    expect(prisma.eventoTrazabilidad.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { clientScanId: 'abc-1' } }));
    expect(res).toEqual(expect.objectContaining({ codigo: 'OF1-0001', estado: 'EN_PROCESO' }));
    expect(res.avance).toEqual(expect.objectContaining({
      estacion: 'PREPARACION', nombre: 'Preparación', terminado: false, hoy: 12, repetido: true,
    }));
    expect(res.avance.nacio).toBeUndefined();
  });

  it('el reintento de un nacimiento por reserva responde nacio (era el primer evento del par)', async () => {
    const { prisma, service } = makePrisma();
    prisma.eventoTrazabilidad.findUnique.mockResolvedValue({
      id: 901, parId: 100, estacionDestino: 'PREPARACION',
      par: { id: 100, codigo: 'OF5-0003', celulaActual: 'GUARNICION', estado: 'EN_PROCESO', calidad: 'PRIMERA' },
    });
    prisma.eventoTrazabilidad.count.mockImplementation(async ({ where }: any) => (where.parId ? 0 : 3));
    const res: any = await service.avanzar('OF5-0003', { operarioId: 3, estacion: 'PREPARACION', clientScanId: 'n-1' });
    expect(res.avance).toEqual(expect.objectContaining({ nacio: true, repetido: true }));
  });

  it('el reintento de un par que terminó en PT dice terminado', async () => {
    const { prisma, service } = makePrisma();
    prisma.eventoTrazabilidad.findUnique.mockResolvedValue({
      id: 902, parId: 50, estacionDestino: 'PT',
      par: { id: 50, codigo: 'OF1-0001', celulaActual: 'PT', estado: 'TERMINADO', calidad: 'PRIMERA' },
    });
    const res: any = await service.avanzar('OF1-0001', { operarioId: 3, estacion: 'PT', clientScanId: 't-1' });
    expect(res.avance).toEqual(expect.objectContaining({ estacion: 'PT', terminado: true, repetido: true }));
  });

  it('dos envíos simultáneos: el que choca con el índice único responde lo del primero', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(PAR_EN_CORTE);
    tx.eventoTrazabilidad.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    prisma.eventoTrazabilidad.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 903, parId: 50, estacionDestino: 'PREPARACION',
        par: { id: 50, codigo: 'OF1-0001', celulaActual: 'GUARNICION', estado: 'EN_PROCESO', calidad: 'PRIMERA' },
      });
    const res: any = await service.avanzar('OF1-0001', { operarioId: 3, estacion: 'PREPARACION', clientScanId: 'abc-3' });
    expect(res.avance.repetido).toBe(true);
  });

  it('un P2002 sin clientScanId no se disfraza de repetido', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(PAR_EN_CORTE);
    tx.eventoTrazabilidad.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    await expect(service.avanzar('OF1-0001', { operarioId: 3, estacion: 'PREPARACION' })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scannedAt en el futuro o de hace más de 7 días: 400 sin tocar nada', async () => {
    const { prisma, tx, service } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(PAR_EN_CORTE);
    const futuro = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const viejo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await expect(service.avanzar('OF1-0001', { operarioId: 3, scannedAt: futuro })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.avanzar('OF1-0001', { operarioId: 3, scannedAt: viejo })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.eventoTrazabilidad.create).not.toHaveBeenCalled();
  });

  it('una etiqueta impresa por adelantado que nace desde la cola lleva la hora y el id', async () => {
    const { prisma, tx, service } = makePrisma();
    const reserva = { id: 77, codigo: 'OF5-0003', ofId: 1, productoConfiguradoId: 10, tallaId: 1, parId: null, anulada: false };
    prisma.par.findUnique.mockResolvedValue(null);
    prisma.etiquetaReservada.findUnique.mockResolvedValue(reserva);
    tx.etiquetaReservada.findUnique.mockResolvedValue(reserva);
    // contextoNacimiento: OF, talla y línea.
    jest.spyOn(service as any, 'contextoNacimiento').mockResolvedValue({
      of: { id: 1, estado: 'EN_PROCESO', consecutivo: 5 }, talla: { valor: 40 }, lineaId: 3,
      nac: ESTACIONES_PILOTO.find((e) => e.codigo === 'PREPARACION'),
    });
    const scannedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await service.avanzar('OF5-0003', { operarioId: 3, estacion: 'PREPARACION', scannedAt, clientScanId: 'n-2' });
    expect(tx.eventoTrazabilidad.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ parId: 100, estacionDestino: 'PREPARACION', timestamp: new Date(scannedAt), clientScanId: 'n-2' })],
    });
  });
});
