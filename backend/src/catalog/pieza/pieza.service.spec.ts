import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PiezaService } from './pieza.service';

describe('PiezaService', () => {
  const prisma = {
    pieza: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bomLinea: { count: jest.fn() },
  } as any;
  const service = new PiezaService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crear normaliza el código a mayúsculas', async () => {
    prisma.pieza.findUnique.mockResolvedValue(null);
    prisma.pieza.create.mockResolvedValue({ id: 1 });
    await service.crear({ codigo: ' capellada ', nombre: 'Capellada' });
    expect(prisma.pieza.create).toHaveBeenCalledWith({
      data: { codigo: 'CAPELLADA', nombre: 'Capellada', orden: 100 },
    });
  });

  it('crear rechaza un código repetido', async () => {
    prisma.pieza.findUnique.mockResolvedValue({ id: 1 });
    await expect(service.crear({ codigo: 'TALON', nombre: 'Talón' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.pieza.create).not.toHaveBeenCalled();
  });

  it('desactivar bloquea una pieza usada por alguna receta', async () => {
    prisma.pieza.findUnique.mockResolvedValue({ id: 5 });
    prisma.bomLinea.count.mockResolvedValue(3);
    await expect(service.desactivar(5)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pieza.update).not.toHaveBeenCalled();
  });

  it('desactivar archiva una pieza que nadie usa', async () => {
    prisma.pieza.findUnique.mockResolvedValue({ id: 5 });
    prisma.bomLinea.count.mockResolvedValue(0);
    prisma.pieza.update.mockResolvedValue({ id: 5, activo: false });
    await service.desactivar(5);
    expect(prisma.pieza.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { activo: false },
    });
  });

  it('actualizar exige que la pieza exista', async () => {
    prisma.pieza.findUnique.mockResolvedValue(null);
    await expect(service.actualizar(9, { nombre: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('listar solo trae las activas, ordenadas por el despiece', async () => {
    prisma.pieza.findMany.mockResolvedValue([]);
    await service.listar();
    expect(prisma.pieza.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });
  });
});
