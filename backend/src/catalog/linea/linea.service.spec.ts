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
    prisma.linea.create.mockResolvedValue({ id: 1, codigo: 'FEROZ' });
    const r = await service.crear({ codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: CelulaDto.INYECCION });
    expect(prisma.linea.create).toHaveBeenCalledWith({
      data: { codigo: 'FEROZ', nombre: 'Feroz', celulaInicial: 'INYECCION' },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'FEROZ' });
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
    prisma.linea.findUnique.mockResolvedValue({ id: 1, codigo: 'FEROZ' });
    prisma.linea.update.mockResolvedValue({ id: 1, nombre: 'Feroz Bogotá' });
    const r = await service.actualizar(1, { nombre: 'Feroz Bogotá', celulaInicial: CelulaDto.INYECCION });
    expect(prisma.linea.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { nombre: 'Feroz Bogotá', celulaInicial: 'INYECCION' },
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

  // Reactivar deshace un desactivar accidental (activo:true).
  it('reactiva (activo:true)', async () => {
    prisma.linea.findUnique.mockResolvedValue({ id: 1, activo: false });
    prisma.linea.update.mockResolvedValue({ id: 1, activo: true });
    const r = await service.reactivar(1);
    expect(prisma.linea.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: true },
    });
    expect(r).toMatchObject({ id: 1, activo: true });
  });

  it('lanza NotFound al reactivar uno inexistente', async () => {
    prisma.linea.findUnique.mockResolvedValue(null);
    await expect(service.reactivar(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listar sin flag trae solo activos; con incluirInactivas trae todos', async () => {
    prisma.linea.findMany.mockResolvedValue([]);
    await service.listar();
    expect(prisma.linea.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { activo: true } }),
    );
    await service.listar(true);
    expect(prisma.linea.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});
