import { ConflictException, NotFoundException } from '@nestjs/common';
import { LineaService } from './linea.service';
import { CelulaDto } from './dto/crear-linea.dto';

describe('LineaService', () => {
  const prisma = {
    linea: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  } as any;
  const service = new LineaService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una línea con los datos provistos', async () => {
    prisma.linea.findUnique.mockResolvedValue(null);
    prisma.linea.create.mockResolvedValue({ id: 1, codigo: 'EXTERNA' });
    const r = await service.crear({ codigo: 'EXTERNA', nombre: 'Externa', celulaInicial: CelulaDto.INYECCION });
    expect(prisma.linea.create).toHaveBeenCalledWith({
      data: { codigo: 'EXTERNA', nombre: 'Externa', celulaInicial: 'INYECCION' },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'EXTERNA' });
  });

  it('rechaza código duplicado', async () => {
    prisma.linea.findUnique.mockResolvedValue({ id: 1, codigo: 'AGRO' });
    await expect(service.crear({ codigo: 'AGRO', nombre: 'Agro' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('lista solo líneas activas ordenadas por nombre', async () => {
    prisma.linea.findMany.mockResolvedValue([]);
    await service.listar();
    expect(prisma.linea.findMany).toHaveBeenCalledWith({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    });
  });

  it('actualiza nombre y célula inicial de una línea existente', async () => {
    prisma.linea.findUnique.mockResolvedValue({ id: 1, codigo: 'EXTERNA' });
    prisma.linea.update.mockResolvedValue({ id: 1, nombre: 'Externa Bogotá' });
    const r = await service.actualizar(1, { nombre: 'Externa Bogotá', celulaInicial: CelulaDto.INYECCION });
    expect(prisma.linea.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { nombre: 'Externa Bogotá', celulaInicial: 'INYECCION' },
    });
    expect(r).toMatchObject({ id: 1 });
  });

  it('lanza NotFound al actualizar una línea inexistente', async () => {
    prisma.linea.findUnique.mockResolvedValue(null);
    await expect(service.actualizar(99, { nombre: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva una línea (activo:false)', async () => {
    prisma.linea.findUnique.mockResolvedValue({ id: 1, codigo: 'AGRO' });
    prisma.linea.update.mockResolvedValue({ id: 1, activo: false });
    const r = await service.desactivar(1);
    expect(prisma.linea.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { activo: false } });
    expect(r).toMatchObject({ id: 1, activo: false });
  });
});
