import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CalidadService } from './calidad.service';

const ventas = { sub: 7, role: 'VENTAS' };
const gerente = { sub: 3, role: 'GERENTE' };
const tipoBaja = {
  id: 8, codigo: 'DANO-ROBOT', nombre: 'Daño de robot en capellada',
  celulaCausante: 'INYECCION', clase: 'BAJA', activo: true,
};
const dtoBaja = { tipoDanoId: 8, operarioId: 9, descripcion: 'Robot rasgó la capellada' };

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
    await expect(new CalidadService(prisma).reportar('OF1-0001', dto, ventas))
      .rejects.toMatchObject({ message: 'Operario inexistente' });
  });
});

describe('CalidadService.reportar — BAJA', () => {
  it('transacción completa: baja condicionada + par de reposición + acta', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    tx.incidenciaCalidad.create.mockResolvedValue({ id: 1, parReposicionId: 99 });

    const res = await new CalidadService(prisma).reportar('OF1-0001', dtoBaja, gerente);

    expect(tx.par.updateMany).toHaveBeenCalledWith({
      where: { id: 50, estado: 'EN_PROCESO' },
      data: { estado: 'DADO_DE_BAJA' },
    });
    expect(tx.par.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigo: 'OF1-0001-R1', ofId: 1, productoConfiguradoId: 10, tallaId: 2,
          celulaActual: 'CORTE', reponeAParId: 50,
        }),
      }),
    );
    expect(tx.incidenciaCalidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parId: 50, tipoDanoId: 8, autorizadoPorId: 3, parReposicionId: 99,
          descripcion: 'Robot rasgó la capellada',
        }),
      }),
    );
    expect(res.parReposicion).toMatchObject({ codigo: 'OF1-0001-R1' });
  });

  it('403 si la sesión no es GERENTE/ADMIN', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    await expect(new CalidadService(prisma).reportar('OF1-0001', dtoBaja, ventas))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('400 si la baja viene sin descripción', async () => {
    const { prisma } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    await expect(
      new CalidadService(prisma).reportar('OF1-0001', { tipoDanoId: 8, operarioId: 9 }, gerente),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 si otro proceso movió el par entre la lectura y la baja (race)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    tx.par.updateMany.mockResolvedValue({ count: 0 });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dtoBaja, gerente))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('un P2003 que NO es de operario (p.ej. autorizadoPor) se relanza, no se enmascara', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue(parEnProceso);
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    tx.incidenciaCalidad.create.mockRejectedValue({
      code: 'P2003',
      meta: { field_name: 'IncidenciaCalidad_autorizadoPorId_fkey' },
    });
    await expect(new CalidadService(prisma).reportar('OF1-0001', dtoBaja, gerente))
      .rejects.not.toBeInstanceOf(BadRequestException);
  });

  it('la reposición de una reposición continúa la cadena (-R1 → -R2)', async () => {
    const { prisma, tx } = makePrisma();
    prisma.par.findUnique.mockResolvedValue({ ...parEnProceso, codigo: 'OF1-0001-R1' });
    prisma.tipoDano.findUnique.mockResolvedValue(tipoBaja);
    await new CalidadService(prisma).reportar('OF1-0001-R1', dtoBaja, gerente);
    expect(tx.par.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codigo: 'OF1-0001-R2' }) }),
    );
  });
});

describe('CalidadService.indicadores', () => {
  it('arma denominadores desde eventos por célula y delega en agruparIndicadores', async () => {
    const { prisma } = makePrisma();
    prisma.incidenciaCalidad.findMany.mockResolvedValue([
      { tipoDano: { codigo: 'X', nombre: 'X', celulaCausante: 'CORTE', clase: 'BAJA' } },
    ]);
    prisma.eventoTrazabilidad.groupBy.mockResolvedValue([
      { celula: 'CORTE', _count: { _all: 4 } },
    ]);

    const res = await new CalidadService(prisma).indicadores();

    expect(prisma.eventoTrazabilidad.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['celula'] }),
    );
    const corte = res.centros.find((c: any) => c.celula === 'CORTE')!;
    expect(corte).toMatchObject({ total: 1, bajas: 1, paresProcesados: 4, pctDano: 0.25 });
    expect(res.topDanos[0]).toMatchObject({ codigo: 'X', total: 1 });
  });
});
