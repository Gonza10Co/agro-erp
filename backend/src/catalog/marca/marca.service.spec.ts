import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarcaService } from './marca.service';
import { TipoMarcaDto } from './dto/crear-marca.dto';

describe('MarcaService', () => {
  const prisma = {
    marca: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const service = new MarcaService(prisma);
  beforeEach(() => jest.clearAllMocks());

  it('crea una marca con los datos provistos', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    prisma.marca.create.mockResolvedValue({
      id: 1,
      codigo: 'M001',
      nombre: 'Basarili',
    });
    const r = await service.crear({
      codigo: 'M001',
      nombre: 'Basarili',
      tipo: TipoMarcaDto.PROPIA,
    });
    expect(prisma.marca.create).toHaveBeenCalledWith({
      data: {
        codigo: 'M001',
        nombre: 'Basarili',
        tipo: TipoMarcaDto.PROPIA,
        clienteId: undefined,
      },
    });
    expect(r).toMatchObject({ id: 1, codigo: 'M001' });
  });

  it('rechaza código duplicado', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, codigo: 'M001' });
    await expect(
      service.crear({
        codigo: 'M001',
        nombre: 'X',
        tipo: TipoMarcaDto.PROPIA,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('actualiza una marca existente', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, codigo: 'M001' });
    prisma.marca.update.mockResolvedValue({ id: 1, nombre: 'Nuevo nombre' });
    const r = await service.actualizar(1, { nombre: 'Nuevo nombre' });
    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { nombre: 'Nuevo nombre', tipo: undefined, clienteId: undefined },
    });
    expect(r).toMatchObject({ id: 1, nombre: 'Nuevo nombre' });
  });

  it('lanza NotFound al actualizar una marca inexistente', async () => {
    prisma.marca.findUnique.mockResolvedValue(null);
    await expect(
      service.actualizar(99, { nombre: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('desactiva una marca (activo:false)', async () => {
    prisma.marca.findUnique.mockResolvedValue({ id: 1, codigo: 'M001' });
    prisma.marca.update.mockResolvedValue({ id: 1, activo: false });
    const r = await service.desactivar(1);
    expect(prisma.marca.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { activo: false },
    });
    expect(r).toMatchObject({ id: 1, activo: false });
  });
});
