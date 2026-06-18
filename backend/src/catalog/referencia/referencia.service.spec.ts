import { ConflictException, NotFoundException } from '@nestjs/common';
import { ReferenciaAbmService } from './referencia.service';

describe('ReferenciaAbmService', () => {
  const prisma = {
    referencia: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    referenciaMarca: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    referenciaEje: {
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  } as any;
  const service = new ReferenciaAbmService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una referencia con los datos provistos', async () => {
    prisma.referencia.findUnique.mockResolvedValue(null);
    prisma.referencia.create.mockResolvedValue({ id: 1, codigo: 'REF1' });
    const r = await service.crear({
      codigo: 'REF1',
      nombreInterno: 'Bota negra',
      tallaMinId: 1,
      tallaMaxId: 9,
    });
    expect(prisma.referencia.create).toHaveBeenCalledWith({
      data: {
        codigo: 'REF1',
        nombreInterno: 'Bota negra',
        tallaMinId: 1,
        tallaMaxId: 9,
      },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'REF1' });
  });

  it('rechaza código duplicado', async () => {
    prisma.referencia.findUnique.mockResolvedValue({ id: 1, codigo: 'REF1' });
    await expect(
      service.crear({
        codigo: 'REF1',
        nombreInterno: 'X',
        tallaMinId: 1,
        tallaMaxId: 9,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza una referencia existente', async () => {
    prisma.referencia.findUnique.mockResolvedValue({ id: 1 });
    prisma.referencia.update.mockResolvedValue({ id: 1, nombreInterno: 'Nuevo' });
    const r = await service.actualizar(1, { nombreInterno: 'Nuevo' });
    expect(prisma.referencia.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        nombreInterno: 'Nuevo',
        tallaMinId: undefined,
        tallaMaxId: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1, nombreInterno: 'Nuevo' });
  });

  it('lanza NotFound al actualizar una referencia inexistente', async () => {
    prisma.referencia.findUnique.mockResolvedValue(null);
    await expect(
      service.actualizar(99, { nombreInterno: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva una referencia existente', async () => {
    prisma.referencia.findUnique.mockResolvedValue({ id: 1 });
    prisma.referencia.update.mockResolvedValue({ id: 1, activo: false });
    const r = await service.desactivar(1);
    expect(prisma.referencia.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
    expect(r).toMatchObject({ activo: false });
  });

  it('asigna una marca a la referencia', async () => {
    prisma.referencia.findUnique.mockResolvedValue({ id: 1 });
    prisma.referenciaMarca.findUnique.mockResolvedValue(null);
    prisma.referenciaMarca.create.mockResolvedValue({ id: 5, marcaId: 3 });
    const r = await service.asignarMarca(1, { marcaId: 3 });
    expect(prisma.referenciaMarca.create).toHaveBeenCalledWith({
      data: { referenciaId: 1, marcaId: 3 },
    });
    expect(r).toMatchObject({ id: 5, marcaId: 3 });
  });

  it('rechaza marca duplicada', async () => {
    prisma.referencia.findUnique.mockResolvedValue({ id: 1 });
    prisma.referenciaMarca.findUnique.mockResolvedValue({ id: 5 });
    await expect(
      service.asignarMarca(1, { marcaId: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('asigna un eje a la referencia', async () => {
    prisma.referencia.findUnique.mockResolvedValue({ id: 1 });
    prisma.referenciaEje.findUnique.mockResolvedValue(null);
    prisma.referenciaEje.create.mockResolvedValue({ id: 7, grupoOpcionId: 2 });
    const r = await service.asignarEje(1, { grupoOpcionId: 2, obligatorio: true });
    expect(prisma.referenciaEje.create).toHaveBeenCalledWith({
      data: { referenciaId: 1, grupoOpcionId: 2, obligatorio: true },
    });
    expect(r).toMatchObject({ id: 7, grupoOpcionId: 2 });
  });
});
