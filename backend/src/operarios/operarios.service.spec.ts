import { ConflictException, NotFoundException } from '@nestjs/common';
import { Celula } from '@prisma/client';
import { OperariosService } from './operarios.service';

describe('OperariosService', () => {
  const prisma = {
    operario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new OperariosService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea un operario en su célula', async () => {
    prisma.operario.findFirst.mockResolvedValue(null);
    prisma.operario.create.mockResolvedValue({ id: 1, nombre: 'Ana' });

    await service.crear({ nombre: 'Ana', celula: Celula.CORTE });

    expect(prisma.operario.create).toHaveBeenCalledWith({
      data: { nombre: 'Ana', celula: Celula.CORTE },
    });
  });

  it('rechaza dos operarios con el mismo nombre en la misma célula', async () => {
    // Si no, no hay manera de saber cuál de los dos escaneó.
    prisma.operario.findFirst.mockResolvedValue({ id: 1, nombre: 'Ana' });
    await expect(
      service.crear({ nombre: 'Ana', celula: Celula.CORTE }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('permite el mismo nombre en células distintas', async () => {
    prisma.operario.findFirst.mockResolvedValue(null);
    prisma.operario.create.mockResolvedValue({ id: 2 });
    await service.crear({ nombre: 'Ana', celula: Celula.GUARNICION });
    expect(prisma.operario.findFirst).toHaveBeenCalledWith({
      where: { nombre: 'Ana', celula: Celula.GUARNICION },
    });
  });

  it('desactiva sin borrar: el operario firma eventos de trazabilidad', async () => {
    prisma.operario.findUnique.mockResolvedValue({
      id: 1,
      nombre: 'Ana',
      celula: Celula.CORTE,
    });
    prisma.operario.update.mockResolvedValue({ id: 1, activo: false });

    await service.actualizar(1, { activo: false });

    expect(prisma.operario.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { nombre: undefined, celula: undefined, activo: false },
    });
  });

  it('detecta el choque de nombres al mover de célula', async () => {
    prisma.operario.findUnique.mockResolvedValue({
      id: 1,
      nombre: 'Ana',
      celula: Celula.CORTE,
    });
    prisma.operario.findFirst.mockResolvedValue({ id: 9, nombre: 'Ana' });

    await expect(
      service.actualizar(1, { celula: Celula.GUARNICION }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('no se acusa a sí mismo de choque cuando nada cambia', async () => {
    prisma.operario.findUnique.mockResolvedValue({
      id: 1,
      nombre: 'Ana',
      celula: Celula.CORTE,
    });
    prisma.operario.update.mockResolvedValue({ id: 1 });

    await service.actualizar(1, { activo: true });

    expect(prisma.operario.findFirst).not.toHaveBeenCalled();
  });

  it('lanza NotFound si no existe', async () => {
    prisma.operario.findUnique.mockResolvedValue(null);
    await expect(service.actualizar(99, { activo: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('administración ve también a los inactivos; el piso no', () => {
    prisma.operario.findMany.mockReturnValue([]);

    service.listar();
    expect(prisma.operario.findMany.mock.calls[0][0].where).toEqual({
      celula: undefined,
    });

    service.listar({ soloActivos: true });
    expect(prisma.operario.findMany.mock.calls[1][0].where).toEqual({
      celula: undefined,
      activo: true,
    });
  });

  it('ordena dejando a los activos primero', () => {
    prisma.operario.findMany.mockReturnValue([]);
    service.listar();
    expect(prisma.operario.findMany.mock.calls[0][0].orderBy).toEqual([
      { activo: 'desc' },
      { nombre: 'asc' },
    ]);
  });
});
