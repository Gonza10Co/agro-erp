import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CalidadService } from './calidad.service';

const ventas = { sub: 7, role: 'VENTAS' };

function makePrisma(overrides: any = {}) {
  const tx = {
    par: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 99, codigo: 'OF1-0001-R1' }),
    },
    incidenciaCalidad: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    ...overrides.tx,
  };
  const prisma: any = {
    par: { findUnique: jest.fn() },
    tipoDano: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    incidenciaCalidad: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    eventoTrazabilidad: { groupBy: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
    ...overrides.root,
  };
  return { prisma, tx };
}

const parEnProceso = {
  id: 50, codigo: 'OF1-0001', ofId: 1, productoConfiguradoId: 10, tallaId: 2,
  celulaActual: 'INYECCION', estado: 'EN_PROCESO',
};
const tipoReproceso = {
  id: 4, codigo: 'STROBEL-RASGADO', nombre: 'Strobel rasgado',
  celulaCausante: 'GUARNICION', clase: 'REPROCESO', activo: true,
};
const dto = { tipoDanoId: 4, operarioId: 9 };

describe('CalidadService.listarTiposDano', () => {
  it('lista solo tipos activos', async () => {
    const { prisma } = makePrisma();
    await new CalidadService(prisma).listarTiposDano();
    expect(prisma.tipoDano.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
  });
});

describe('CalidadService.reportar — REPROCESO', () => {
  it('crea la incidencia con célula de detección y NO toca el par', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoReproceso);

    const res = await new CalidadService(prisma).reportar('OF1-0001', dto, ventas);

    expect(prisma.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parId: 50, tipoDanoId: 4, celulaDeteccion: 'INYECCION', operarioId: 9,
        }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(res.parReposicion).toBeNull();
  });

  it('404 si el par no existe', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(null);
    await expect(new CalidadService(prisma).reportar('X', dto, ventas))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 si el tipo de daño no existe o está inactivo', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue({ ...tipoReproceso, activo: false });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('409 si el par no está EN_PROCESO (terminado / cancelado / dado de baja)', async () => {
    for (const estado of ['TERMINADO', 'CANCELADO', 'DADO_DE_BAJA']) {
      const { prisma } = makePrisma();
      prisma.par.findUnique.mockResolvedValue({ ...parEnProceso, estado });
      prisma.tipoDano.findUnique.mockResolvedValue(tipoReproceso);
      await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
        .rejects.toBeInstanceOf(ConflictException);
    }
  });

  it('400 con campo concreto si el operario no existe (P2003)', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoReproceso);
    prisma.incidenciaCalidad.create.mockRejectedValue({ code: 'P2003' });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
