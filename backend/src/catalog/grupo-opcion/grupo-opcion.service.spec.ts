import { ConflictException, NotFoundException } from '@nestjs/common';
import { GrupoOpcionService } from './grupo-opcion.service';

describe('GrupoOpcionService', () => {
  const prisma = {
    grupoOpcion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    opcion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new GrupoOpcionService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea un grupo de opción con los datos provistos', async () => {
    prisma.grupoOpcion.findUnique.mockResolvedValue(null);
    prisma.grupoOpcion.create.mockResolvedValue({
      id: 1,
      codigo: 'COLOR',
      nombre: 'Color',
    });
    const r = await service.crearGrupo({ codigo: 'COLOR', nombre: 'Color' });
    expect(prisma.grupoOpcion.create).toHaveBeenCalledWith({
      data: {
        codigo: 'COLOR',
        nombre: 'Color',
        obligatorio: undefined,
        orden: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'COLOR' });
  });

  it('rechaza código de grupo duplicado', async () => {
    prisma.grupoOpcion.findUnique.mockResolvedValue({ id: 1, codigo: 'COLOR' });
    await expect(
      service.crearGrupo({ codigo: 'COLOR', nombre: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('agrega una opción a un grupo existente', async () => {
    prisma.grupoOpcion.findUnique.mockResolvedValue({ id: 1, codigo: 'COLOR' });
    prisma.opcion.findUnique.mockResolvedValue(null);
    prisma.opcion.create.mockResolvedValue({
      id: 10,
      grupoOpcionId: 1,
      codigo: 'NEGRO',
    });
    const r = await service.agregarOpcion(1, {
      codigo: 'NEGRO',
      nombre: 'Negro',
    });
    expect(prisma.opcion.create).toHaveBeenCalledWith({
      data: { grupoOpcionId: 1, codigo: 'NEGRO', nombre: 'Negro' },
    });
    expect(r).toMatchObject({ id: 10, codigo: 'NEGRO' });
  });

  it('rechaza opción con código duplicado dentro del grupo', async () => {
    prisma.grupoOpcion.findUnique.mockResolvedValue({ id: 1, codigo: 'COLOR' });
    prisma.opcion.findUnique.mockResolvedValue({
      id: 10,
      grupoOpcionId: 1,
      codigo: 'NEGRO',
    });
    await expect(
      service.agregarOpcion(1, { codigo: 'NEGRO', nombre: 'Negro' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('desactiva una opción existente', async () => {
    prisma.opcion.findUnique.mockResolvedValue({ id: 10, activo: true });
    prisma.opcion.update.mockResolvedValue({ id: 10, activo: false });
    const r = await service.desactivarOpcion(10);
    expect(prisma.opcion.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { activo: false },
    });
    expect(r).toMatchObject({ id: 10, activo: false });
  });

  it('lanza NotFound al agregar opción a un grupo inexistente', async () => {
    prisma.grupoOpcion.findUnique.mockResolvedValue(null);
    await expect(
      service.agregarOpcion(999, { codigo: 'NEGRO', nombre: 'Negro' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
